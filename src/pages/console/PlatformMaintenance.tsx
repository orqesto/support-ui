import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Clock, Wrench } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Select, type Option } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { Toggle } from '@/components/ui/Toggle';
import { ConsolePageHeader } from '@/components/console/ConsolePageHeader';
import { GlobalAdminMembershipsCard } from '@/components/console/maintenance/GlobalAdminMembershipsCard';
import { SyncCheckpointsCard } from '@/components/console/maintenance/SyncCheckpointsCard';
import {
  REPAIRS,
  REPAIRS_ELSEWHERE,
  moreRemains,
  type RepairEntry,
} from '@/components/console/maintenance/repairCatalog';
import { usePlatformWorkspaces } from '@/hooks/usePlatformAdmin';
import { apiErrorMessage, isRouteAbsent } from '@/lib/apiError';
import maintenanceService, {
  type MaintenanceJob,
  type MaintenanceJobSchedule,
  type RepairResult,
} from '@/services/maintenance.service';

/**
 * Platform console → Maintenance (owner decisions 2026-10-20): everything that runs besides the
 * normal mail work, in one place.
 * - Background jobs: what each does, its schedule, last run and next run, and a switch that turns
 *   it off for the whole deployment (within about a minute, no restart).
 * - Repairs: one-off fixes run in a picked workspace (or across all), Check first, then Apply.
 *   "Repairs allowed" switches every repair route off at once.
 */

const MAINTENANCE_KEY = ['platform', 'maintenance'] as const;

const pad = (value: number) => String(value).padStart(2, '0');

export const describeSchedule = (schedule: MaintenanceJobSchedule): string => {
  if (schedule.kind === 'startup') return 'When the server starts';
  if (schedule.kind === 'daily') {
    const time = `${pad(schedule.hour)}:${pad(schedule.minute ?? 0)}`;
    return `${schedule.note ? `${schedule.note} at` : 'Daily at'} ${time} (server time)`;
  }
  if (schedule.minutes >= 24 * 60) return 'Once a day';
  if (schedule.minutes >= 60) return `Every ${schedule.minutes / 60} h`;
  return schedule.minutes === 1 ? 'Every minute' : `Every ${schedule.minutes} min`;
};

const formatTime = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
};

const OUTCOME_BADGE = {
  ok: { variant: 'success', label: 'OK' },
  failed: { variant: 'danger', label: 'Failed' },
  skipped: { variant: 'secondary', label: 'Skipped (off)' },
} as const;

const JOB_GROUPS: Array<{ title: string; match: (job: MaintenanceJob) => boolean }> = [
  { title: 'Every few minutes or hours', match: (job) => job.schedule.kind === 'interval' },
  { title: 'Daily', match: (job) => job.schedule.kind === 'daily' },
  { title: 'At start-up', match: (job) => job.schedule.kind === 'startup' },
];

const JobRow = ({
  job,
  onToggle,
  pending,
}: {
  job: MaintenanceJob;
  onToggle: (enabled: boolean) => void;
  pending: boolean;
}) => {
  const outcome = job.lastRun ? OUTCOME_BADGE[job.lastRun.outcome] : null;
  return (
    <li className="py-3 border-b border-border last:border-b-0" data-testid={`job-${job.id}`}>
      <div className="flex flex-wrap gap-x-4 gap-y-2 justify-between items-start">
        <div className="min-w-0 flex-1 basis-64">
          <p className="font-medium text-foreground">{job.label}</p>
          <p className="text-sm text-muted-foreground">{job.does}</p>
          {!job.enabled && <p className="mt-1 text-sm text-warning">Off: {job.whenOff}</p>}
        </div>
        <div className="text-sm text-muted-foreground basis-56">
          <p>{describeSchedule(job.schedule)}</p>
          <p className="flex flex-wrap gap-2 items-center">
            Last run: {job.lastRun ? formatTime(job.lastRun.at) : 'not recorded yet'}
            {outcome && (
              <Badge variant={outcome.variant} size="sm">
                {outcome.label}
              </Badge>
            )}
          </p>
          {job.lastRun?.outcome === 'failed' && job.lastRun.error && (
            <p className="text-destructive break-words">{job.lastRun.error}</p>
          )}
          {job.lastRun?.outcome === 'skipped' && job.lastRun.lastRanAt && (
            <p>Last real run: {formatTime(job.lastRun.lastRanAt)}</p>
          )}
          {job.enabled && job.nextRunAt && <p>Next run: {formatTime(job.nextRunAt)}</p>}
        </div>
        <Toggle
          checked={job.enabled}
          disabled={pending}
          onChange={onToggle}
          label={job.enabled ? 'On' : 'Off'}
          ariaLabel={job.label}
        />
      </div>
    </li>
  );
};

/** One repair: Check (dry run), then Apply with a confirm. Apply needs a Check first. */
const RepairRow = ({
  repair,
  organizationId,
  allowed,
}: {
  repair: RepairEntry;
  organizationId: number | null;
  allowed: boolean;
}) => {
  const [busy, setBusy] = useState<'check' | 'apply' | null>(null);
  const [checked, setChecked] = useState<RepairResult | null>(null);
  const [applied, setApplied] = useState<RepairResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  // A paged repair that stopped at its limit: where the next run continues.
  const [cursor, setCursor] = useState<number | null>(null);
  // Where the last Check started: Apply must write that same batch, not the one after it.
  const [checkedFrom, setCheckedFrom] = useState<number | null>(null);

  const needsWorkspace = repair.scope === 'workspace' && !organizationId;
  const target = repair.scope === 'workspace' ? organizationId : null;
  const platformIds =
    repair.scope === 'platform' && Array.isArray(checked?.organizationIds)
      ? (checked.organizationIds as number[])
      : [];

  const run = async (apply: boolean) => {
    setBusy(apply ? 'apply' : 'check');
    setError(null);
    try {
      const body: Record<string, unknown> = apply ? { apply: true } : {};
      if (apply && repair.scope === 'platform') body.organizationIds = platformIds;
      const from = apply ? checkedFrom : cursor;
      if (repair.pagedByEventId && from !== null) body.afterEventId = from;
      if (!apply) setCheckedFrom(from);
      const result = await maintenanceService.runRepair(
        repair.path,
        repair.method ?? 'post',
        body,
        target
      );
      if (repair.pagedByEventId) {
        const next = result.nextAfterEventId;
        setCursor(moreRemains(result) && typeof next === 'number' ? next : null);
      }
      // An Apply spends its Check: the next Apply needs a fresh one.
      if (apply) {
        setApplied(result);
        setChecked(null);
      } else {
        setChecked(result);
        setApplied(null);
      }
    } catch (err) {
      setError(apiErrorMessage(err, 'The repair failed.'));
      // A failed Check must not leave an older Check's result arming Apply.
      if (!apply) setChecked(null);
    } finally {
      setBusy(null);
    }
  };

  const applyDisabled =
    !allowed ||
    needsWorkspace ||
    busy !== null ||
    checked === null ||
    (repair.scope === 'platform' && platformIds.length === 0);

  return (
    <li className="py-3 border-b border-border last:border-b-0" data-testid={`repair-${repair.id}`}>
      <div className="flex flex-wrap gap-3 justify-between items-start">
        <div className="min-w-0 flex-1 basis-64">
          <p className="font-medium text-foreground">
            {repair.label}{' '}
            {repair.scope === 'platform' && (
              <Badge variant="secondary" size="sm">
                All workspaces
              </Badge>
            )}
          </p>
          <p className="text-sm text-muted-foreground">{repair.does}</p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            isLoading={busy === 'check'}
            // A read-only report is not a repair: the backend serves it whatever the switch says.
            disabled={(!allowed && !repair.checkOnly) || needsWorkspace || busy !== null}
            onClick={() => void run(false)}
          >
            {cursor !== null ? 'Check next batch' : 'Check'}
          </Button>
          {!repair.checkOnly && (
            <Button
              size="sm"
              variant="destructive"
              isLoading={busy === 'apply'}
              disabled={applyDisabled}
              onClick={() => setConfirming(true)}
            >
              Apply
            </Button>
          )}
        </div>
      </div>
      {error && (
        <Alert variant="danger" className="mt-2">
          {error}
        </Alert>
      )}
      {checked && <RepairResultView title="Check (nothing changed)" result={checked} />}
      {applied && <RepairResultView title="Applied" result={applied} />}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        variant="danger"
        title={`Apply "${repair.label}"?`}
        description={
          <span className="space-y-2 block">
            <span className="block">
              {repair.scope === 'platform'
                ? `This writes in the ${platformIds.length} workspace(s) the check found.`
                : 'This writes in the selected workspace. The change is audit-logged.'}
            </span>
            {repair.caution && <span className="block font-medium">{repair.caution}</span>}
          </span>
        }
        confirmText="Apply"
        onConfirm={() => {
          setConfirming(false);
          void run(true);
        }}
      />
    </li>
  );
};

/** Counts on a list of records, added up — e.g. a platform check's `workspaces[]`. */
const sumCounts = (items: unknown[]): string =>
  Object.entries(
    items.reduce<Record<string, number>>((totals, item) => {
      if (item === null || typeof item !== 'object') return totals;
      const record = item as Record<string, unknown>;
      const nested =
        record.counts !== null && typeof record.counts === 'object'
          ? (record.counts as Record<string, unknown>)
          : {};
      for (const [key, inner] of Object.entries({ ...record, ...nested })) {
        if (typeof inner === 'number' && key !== 'organizationId') {
          totals[key] = (totals[key] ?? 0) + inner;
        }
      }
      return totals;
    }, {})
  )
    .map(([key, total]) => `${key} ${total}`)
    .join(' · ');

export const formatValue = (value: unknown): string => {
  if (Array.isArray(value)) {
    const totals = sumCounts(value);
    return totals ? `${value.length} item(s) · ${totals}` : `${value.length} item(s)`;
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, inner]) => typeof inner === 'number' || typeof inner === 'boolean')
      .map(([key, inner]) => `${key} ${String(inner)}`)
      .join(' · ');
  }
  return String(value);
};

/** The backend's answer as it came: each top-level count, nested counts on one line. */
const RepairResultView = ({ title, result }: { title: string; result: RepairResult }) => {
  const rows = Object.entries(result).filter(
    ([key, value]) => key !== 'success' && value !== undefined && formatValue(value) !== ''
  );
  return (
    <div className="p-3 mt-2 text-sm rounded-md bg-muted/40">
      <p className="mb-1 font-medium text-foreground">{title}</p>
      <dl className="grid grid-cols-[minmax(0,12rem)_1fr] gap-x-3 gap-y-0.5">
        {rows.map(([key, value]) => (
          <div key={key} className="contents">
            <dt className="text-muted-foreground break-words">{key}</dt>
            <dd className="break-words text-foreground">{formatValue(value)}</dd>
          </div>
        ))}
      </dl>
      {Array.isArray(result.byMailbox) && (
        <ul className="mt-2 space-y-0.5" data-testid="by-mailbox">
          {(
            result.byMailbox as Array<{ messageSourceId: number; name?: string; partsLost: number }>
          ).map((box) => (
            <li key={box.messageSourceId}>
              {box.name ?? `Mailbox ${box.messageSourceId}`}: {box.partsLost} attachment(s) lost
            </li>
          ))}
        </ul>
      )}
      {moreRemains(result) && (
        <p className="mt-2 text-warning">
          {typeof result.nextAfterEventId === 'number'
            ? 'More remain — use “Check next batch” to continue where this stopped.'
            : 'More remain — run it again.'}
        </p>
      )}
    </div>
  );
};

export const PlatformMaintenance = () => {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: MAINTENANCE_KEY,
    queryFn: () => maintenanceService.get(),
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  });
  const workspacesQuery = usePlatformWorkspaces();
  const [workspace, setWorkspace] = useState('');

  const toggleJob = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean; startup: boolean }) =>
      maintenanceService.setJobEnabled(id, enabled),
    onSuccess: (_data, { enabled, startup }) => {
      const when = startup ? 'applies at the next server start' : 'takes effect within a minute';
      toast.success(`Job switched ${enabled ? 'on' : 'off'} — ${when}`);
      void queryClient.invalidateQueries({ queryKey: MAINTENANCE_KEY });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not change the job.')),
  });
  const toggleRepairs = useMutation({
    mutationFn: (allowed: boolean) => maintenanceService.setRepairsAllowed(allowed),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: MAINTENANCE_KEY }),
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not change the repairs switch.')),
  });

  const workspaceOptions = useMemo<Option[]>(
    () =>
      (workspacesQuery.data?.data ?? []).map((ws) => ({ value: String(ws.id), label: ws.name })),
    [workspacesQuery.data]
  );

  if (query.isLoading) return <Spinner size={24} />;
  if (query.isError) {
    return (
      <div className="space-y-6">
        <ConsolePageHeader title="Maintenance" />
        <Alert variant={isRouteAbsent(query.error) ? 'info' : 'danger'}>
          {isRouteAbsent(query.error)
            ? 'This server does not have the Maintenance page yet — it arrives with the next backend release.'
            : apiErrorMessage(query.error, 'Could not load maintenance.')}
        </Alert>
      </div>
    );
  }
  const state = query.data;
  if (!state) return null;
  const allowed = state.repairs.allowed;
  const organizationId = workspace ? Number(workspace) : null;

  return (
    <div className="space-y-6">
      <ConsolePageHeader
        title="Maintenance"
        description="Everything that runs besides the normal mail work: background jobs and one-off repairs."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex gap-2 items-center">
            <Clock className="w-5 h-5 text-muted-foreground" />
            Background jobs
          </CardTitle>
          <CardDescription>
            Switching a job off stops it on the whole deployment within about a minute, with no
            restart. Its row then shows &ldquo;Skipped&rdquo; at each tick until it is back on.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {JOB_GROUPS.map((group) => {
            const jobs = state.jobs.filter(group.match);
            if (jobs.length === 0) return null;
            return (
              <section key={group.title}>
                <h3 className="text-sm font-semibold text-foreground">{group.title}</h3>
                <ul>
                  {jobs.map((job) => (
                    <JobRow
                      key={job.id}
                      job={job}
                      pending={toggleJob.isPending}
                      onToggle={(enabled) =>
                        toggleJob.mutate({
                          id: job.id,
                          enabled,
                          startup: job.schedule.kind === 'startup',
                        })
                      }
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex gap-2 items-center">
            <Wrench className="w-5 h-5 text-muted-foreground" />
            Repairs
          </CardTitle>
          <CardDescription>
            One-off fixes for data written by older versions. Check shows what would change and
            changes nothing; Apply writes and is audit-logged.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4 justify-between items-center">
            <div>
              <Toggle
                checked={allowed}
                disabled={toggleRepairs.isPending}
                onChange={(next) => toggleRepairs.mutate(next)}
                label={allowed ? 'Repairs allowed' : 'Repairs switched off'}
                ariaLabel="Repairs allowed"
              />
              {state.repairs.source === 'default' && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Not saved here yet — following the server&rsquo;s setting.
                </p>
              )}
            </div>
            <div className="w-full max-w-xs">
              <Select
                inputId="maintenance-workspace"
                aria-label="Workspace the repairs run in"
                value={workspace}
                onChange={setWorkspace}
                options={workspaceOptions}
                isLoading={workspacesQuery.isLoading}
                placeholder="Pick a workspace"
                searchable
              />
            </div>
          </div>
          {!allowed && (
            <Alert variant="warning">
              Repairs are switched off on this deployment. Every repair answers &ldquo;switched
              off&rdquo; until they are allowed again.
            </Alert>
          )}
          {/* A result read in one workspace must not sit next to an Apply that now writes to
              another: remount the rows on a switch. */}
          <ul key={workspace || 'none'}>
            {REPAIRS.map((repair) => (
              <RepairRow
                key={repair.id}
                repair={repair}
                organizationId={organizationId}
                allowed={allowed}
              />
            ))}
          </ul>
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Repairs with a screen of their own</p>
            <ul className="mt-1 space-y-0.5">
              {REPAIRS_ELSEWHERE.map((entry) => (
                <li key={entry.label}>
                  {entry.label} — {entry.where}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Platform-wide tools moved here from Console → System (2026-10-20). */}
      <SyncCheckpointsCard />
      <GlobalAdminMembershipsCard />
    </div>
  );
};
