import { useEffect, useState } from 'react';
import { AlertTriangle, CalendarClock, Database } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { ConsoleEmpty } from '@/components/console/ConsoleEmpty';
import { ConsoleLoading } from '@/components/console/ConsoleLoading';
import { ConsolePageHeader } from '@/components/console/ConsolePageHeader';
import { WorkspaceDatabaseDialog } from '@/components/console/WorkspaceDatabaseDialog';
import { useDatabaseRetentionList, useDegradedDatabases } from '@/hooks/useDatabaseConsole';
import { usePlatformSettings, useUpdatePlatformDatabase } from '@/hooks/usePlatformSettings';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { toast } from '@/lib/toast';
import { formatDate } from '@/lib/utils';
import { STATUS_BADGE, STATUS_LABEL } from '@/components/settings/providers/DatabaseConfigCard';

/**
 * The Free-on-managed retention window (BYODB §3.4). Applies to workspaces stamped from now
 * on; a deadline already written is never moved by changing this — that is stated on the
 * card because a shorter number that silently pulled deadlines closer would be a deletion.
 */
const RetentionSettingCard = () => {
  const settings = usePlatformSettings();
  const update = useUpdatePlatformDatabase();
  const stored = settings.data?.database?.freeSharedRetentionDays;
  const [days, setDays] = useState<string>('');

  // Seed from the STORED value and follow it after a save (the query invalidates).
  useEffect(() => {
    if (stored?.value !== null && stored?.value !== undefined) setDays(String(stored.value));
  }, [stored?.value]);

  const parsed = Number(days);
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 3650;
  const dirty = stored ? String(stored.value ?? '') !== days : false;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex gap-2 items-center">
          <CalendarClock className="h-5 w-5" />
          Free workspaces on the managed database
        </CardTitle>
        <CardDescription>
          Free runs on its own Postgres. A Free workspace still on the managed database gets a
          deadline this many days out; org admins are emailed at 60, 30, 7 and 1 days. Changing the
          number applies to workspaces stamped from now on — existing deadlines stay where they are.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {settings.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !stored ? (
          <p className="text-sm text-muted-foreground">
            This backend does not report the retention setting yet.
          </p>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-40">
              <Input
                label="Retention days"
                type="number"
                min={1}
                max={3650}
                value={days}
                onChange={(event) => setDays(event.target.value)}
                error={days && !valid ? 'Between 1 and 3650' : undefined}
              />
            </div>
            <Button
              disabled={!valid || !dirty}
              isLoading={update.isPending}
              onClick={() =>
                update.mutate(
                  { retentionDays: parsed },
                  {
                    onSuccess: () => toast.success(`Retention set to ${parsed} days for newly stamped workspaces`),
                    onError: (error) => toast.error(getApiErrorMessage(error) ?? 'Could not save the setting'),
                  }
                )
              }
            >
              Save
            </Button>
            <span className="pb-2 text-xs text-muted-foreground">
              {stored.source === 'db' ? 'from console' : 'built-in default'}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

/**
 * Platform console → Databases (BYODB Phase 2). Three things an operator needs in one place:
 * the retention window, every Free workspace still on the managed database by deadline, and
 * every own-database workspace whose database is not answering. Each row opens the
 * per-workspace dialog (re-verify / migrations / move cleanup).
 */
export const PlatformDatabases = () => {
  const retention = useDatabaseRetentionList();
  const degraded = useDegradedDatabases();
  const [target, setTarget] = useState<{ id: number; name: string } | null>(null);

  return (
    <div className="space-y-6">
      <ConsolePageHeader
        title="Databases"
        description="Where each workspace's data lives: Odly's managed database, or the workspace's own Postgres."
      />

      <RetentionSettingCard />

      <Card>
        <CardHeader>
          <CardTitle className="flex gap-2 items-center">
            <AlertTriangle className="h-5 w-5" />
            Paused — own database not answering
          </CardTitle>
          <CardDescription>
            Ingestion and the inbox are paused for these workspaces; nothing falls back to the
            managed database. They resume by themselves when their database answers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {degraded.isLoading ? (
            <ConsoleLoading />
          ) : degraded.isError ? (
            <Alert variant="danger">{getApiErrorMessage(degraded.error) ?? 'Could not load paused workspaces.'}</Alert>
          ) : (degraded.data ?? []).length === 0 ? (
            <ConsoleEmpty message="Every own-database workspace is answering." icon={Database} className="py-4" />
          ) : (
            <ul className="divide-y divide-border" data-testid="degraded-list">
              {(degraded.data ?? []).map((row) => (
                <li key={row.organizationId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{row.organizationName}</span>
                    <code className="text-xs text-muted-foreground">{row.organizationSlug}</code>
                    <Badge variant={STATUS_BADGE[row.status]} size="sm">{STATUS_LABEL[row.status]}</Badge>
                  </span>
                  <span className="flex items-center gap-3 text-xs text-muted-foreground">
                    last answered {row.verifiedAt ? formatDate(row.verifiedAt) : 'never'}
                    <Button variant="outline" size="sm" onClick={() => setTarget({ id: row.organizationId, name: row.organizationName })}>
                      Open
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex gap-2 items-center">
            <CalendarClock className="h-5 w-5" />
            Free workspaces still on the managed database
          </CardTitle>
          <CardDescription>
            Soonest deadline first. Connecting an own database moves the data and clears the
            deadline; so does upgrading. Suspension and deletion after the deadline are not yet
            automated (Phase 3).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {retention.isLoading ? (
            <ConsoleLoading />
          ) : retention.isError ? (
            <Alert variant="danger">{getApiErrorMessage(retention.error) ?? 'Could not load the retention list.'}</Alert>
          ) : (retention.data ?? []).length === 0 ? (
            <ConsoleEmpty message="No Free workspace is on the managed database." icon={Database} className="py-4" />
          ) : (
            <ul className="divide-y divide-border" data-testid="retention-list">
              {(retention.data ?? []).map((row) => {
                const overdue = row.daysLeft !== null && row.daysLeft <= 0;
                return (
                  <li key={row.organizationId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{row.organizationName}</span>
                      <code className="text-xs text-muted-foreground">{row.organizationSlug}</code>
                    </span>
                    <span className="flex items-center gap-3 text-xs text-muted-foreground">
                      <Badge variant={overdue ? 'danger' : (row.daysLeft ?? 99) <= 7 ? 'warning' : 'secondary'} size="sm">
                        {row.daysLeft === null ? 'no deadline' : overdue ? 'overdue' : `${row.daysLeft} day${row.daysLeft === 1 ? '' : 's'} left`}
                      </Badge>
                      {row.sharedRetentionUntil && formatDate(row.sharedRetentionUntil)}
                      <span>warned: {row.warningsSent.length ? row.warningsSent.map((mark) => `${mark}d`).join(', ') : 'not yet'}</span>
                      <Button variant="outline" size="sm" onClick={() => setTarget({ id: row.organizationId, name: row.organizationName })}>
                        Open
                      </Button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <WorkspaceDatabaseDialog org={target} onClose={() => setTarget(null)} />
    </div>
  );
};
