import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Activity, Cpu, KeyRound, RefreshCw, ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/Dialog';
import { Spinner } from '@/components/ui/Spinner';
import { ConsolePageHeader } from '@/components/console/ConsolePageHeader';
import { licenseService } from '@/services/license.service';
import { platformService } from '@/services/platform.service';
import systemService, { type StrayAdminMembership } from '@/services/system.service';
import {
  usePlatformQueueStatus,
  usePlatformSyncCheckpoints,
  useClearSyncCheckpoints,
} from '@/hooks/usePlatformAdmin';

/**
 * Platform console → System. Genuinely PLATFORM-level operational tools that already
 * have global-admin (`/api/admin/*`) endpoints: license status, resource/queue health,
 * and sync-checkpoint management. Deliberately does NOT reuse the workspace
 * `SystemManagementSettings` (its "delete everything for your workspace" ops are per-org
 * and meaningless without an org context, which platform scope suppresses).
 *
 * The all-org "migrate storage" action was removed: it POSTed no target backend (a hard
 * 400) and is a dangerous bulk op not needed for current deployments. A proper version
 * needs a target-backend picker before it comes back.
 */

/**
 * A global admin must only belong to the internal system org.
 *
 * Rows predating the guards still exist and are load-bearing: `allianceAdminDerivation` and
 * `allianceSeatCap` both EXCLUDE `users.role='admin'`, so the membership is invisible to the
 * derivation and to the seat maths, and SCIM refuses the same account outright. The repair was
 * a script — and a script needs a shell, which a self-hosted deployment does not have.
 *
 * ⛔ Two steps on purpose. The scan is read-only and always runs first, so nobody removes rows
 * they have not seen; the removal is confirmed separately and names the count.
 */
const GlobalAdminMembershipsCard = () => {
  const [rows, setRows] = useState<StrayAdminMembership[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);

  const scan = async () => {
    setScanning(true);
    try {
      const result = await systemService.listGlobalAdminMemberships();
      setRows(result.data?.memberships ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not read the memberships.');
    } finally {
      setScanning(false);
    }
  };

  const remove = async () => {
    setRemoving(true);
    try {
      const result = await systemService.cleanupGlobalAdminMemberships(true);
      const removed = result.data?.removed ?? 0;
      toast.success(
        removed === 0
          ? 'Nothing to remove.'
          : `Removed ${removed} membership${removed === 1 ? '' : 's'}. Platform roles were not changed.`
      );
      setConfirming(false);
      await scan();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove the memberships.');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex gap-2 items-center">
          <ShieldAlert className="w-5 h-5 text-primary" />
          Global-admin memberships
        </CardTitle>
        <CardDescription>
          A platform administrator should belong only to the internal system workspace. A membership
          in a customer workspace is invisible to the alliance admin derivation and to the seat
          maths, and the same account cannot be provisioned by SCIM at all.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <Button variant="secondary" size="sm" onClick={() => void scan()} disabled={scanning}>
            {scanning ? 'Scanning…' : 'Scan'}
          </Button>
          {rows !== null && rows.length > 0 && (
            <Button variant="destructive" size="sm" onClick={() => setConfirming(true)}>
              Remove {rows.length} membership{rows.length === 1 ? '' : 's'}
            </Button>
          )}
        </div>

        {rows === null ? (
          <p className="text-xs text-muted-foreground">
            Nothing has been read yet — the scan makes no changes.
          </p>
        ) : rows.length === 0 ? (
          <Alert variant="success">
            <span className="text-sm">
              No platform administrator holds a customer-workspace membership. The invariant holds.
            </span>
          </Alert>
        ) : (
          <ul className="rounded-md border border-border">
            {rows.map((row) => (
              <li
                key={row.membershipId}
                className="px-3 py-2 text-sm border-t border-border first:border-t-0"
              >
                <span className="font-mono text-xs">{row.userEmail}</span>
                <span className="text-muted-foreground"> in </span>
                <strong>{row.organizationName}</strong>
                {!row.active && (
                  <Badge variant="secondary" className="ml-2 text-xs">
                    already deactivated
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Remove these memberships?"
        description={`This removes ${rows?.length ?? 0} membership${(rows?.length ?? 0) === 1 ? '' : 's'} and the department links that go with them, across workspaces. It does NOT change anyone's platform role — an account SCIM refuses is refused for being a platform admin, which only a role change resolves.`}
        confirmText={removing ? 'Removing…' : 'Remove'}
        onConfirm={() => {
          if (!removing) void remove();
        }}
      />
    </Card>
  );
};

const RESOURCE_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'secondary'> = {
  healthy: 'success',
  ok: 'success',
  warning: 'warning',
  critical: 'danger',
  degraded: 'warning',
};

const formatDate = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
};

export const PlatformSystem = () => {
  const licenseQuery = useQuery({
    queryKey: ['platform', 'license-status'],
    queryFn: () => licenseService.getLicenseStatus(),
    refetchOnWindowFocus: false,
  });
  const queueQuery = usePlatformQueueStatus();
  const checkpointsQuery = usePlatformSyncCheckpoints();
  const clearCheckpoints = useClearSyncCheckpoints();

  const [confirm, setConfirm] = useState<null | 'clear-checkpoints'>(null);

  // Failed-jobs drill-down: clicking a queue's failed count loads the actual errors.
  const [failedQueue, setFailedQueue] = useState<string | null>(null);
  const failedJobsQuery = useQuery({
    queryKey: ['platform', 'queue-failed', failedQueue],
    queryFn: () => platformService.getQueueFailedJobs(failedQueue as string),
    enabled: !!failedQueue,
    refetchOnWindowFocus: false,
  });

  const handleClearCheckpoints = async () => {
    try {
      const result = await clearCheckpoints.mutateAsync();
      toast.success(`Cleared ${result.count} checkpoint${result.count === 1 ? '' : 's'}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not clear checkpoints');
    } finally {
      setConfirm(null);
    }
  };

  const resources = queueQuery.data?.resources;
  const queues = queueQuery.data?.queues ?? [];
  const checkpointCount = checkpointsQuery.data?.length ?? 0;

  return (
    <div className="space-y-6">
      <ConsolePageHeader
        title="System"
        description="Platform-level operations and health. Workspace-specific cleanup lives in each workspace's own settings."
      />

      {/* License */}
      <Card>
        <CardHeader>
          <CardTitle className="flex gap-2 items-center">
            <KeyRound className="w-5 h-5 text-primary" />
            License
          </CardTitle>
        </CardHeader>
        <CardContent>
          {licenseQuery.isLoading ? (
            <Spinner size={20} />
          ) : licenseQuery.data ? (
            <div className="flex flex-wrap gap-6 text-sm">
              <div>
                <p className="text-muted-foreground">Client</p>
                <p className="font-medium text-foreground">{licenseQuery.data.clientId}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Expires</p>
                <p className="font-medium text-foreground">
                  {formatDate(licenseQuery.data.expiresAt)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Days left</p>
                <Badge variant={licenseQuery.data.daysLeft <= 14 ? 'warning' : 'success'}>
                  {licenseQuery.data.daysLeft}
                </Badge>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              License enforcement is off (development or self-license).
            </p>
          )}
        </CardContent>
      </Card>

      {/* Resources & queues */}
      <Card>
        <CardHeader>
          <CardTitle className="flex gap-2 items-center">
            <Activity className="w-5 h-5 text-primary" />
            Resources &amp; queues
          </CardTitle>
          <CardDescription>Live worker resource usage and background queue depth.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {queueQuery.isLoading ? (
            <Spinner size={20} />
          ) : queueQuery.isError ? (
            <Alert variant="danger">
              <div className="flex gap-3 justify-between items-center">
                <span>Couldn&apos;t load queue status.</span>
                <Button variant="secondary" onClick={() => void queueQuery.refetch()}>
                  Retry
                </Button>
              </div>
            </Alert>
          ) : (
            <>
              {resources && (
                <div className="flex flex-wrap gap-6 text-sm">
                  <div className="flex gap-2 items-center">
                    <Cpu className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">CPU</span>
                    <span className="font-medium text-foreground">{resources.cpu}</span>
                  </div>
                  <div className="flex gap-2 items-center">
                    <span className="text-muted-foreground">Memory</span>
                    <span className="font-medium text-foreground">{resources.memory}</span>
                  </div>
                  <div className="flex gap-2 items-center">
                    <span className="text-muted-foreground">Status</span>
                    <Badge variant={RESOURCE_VARIANT[resources.status] ?? 'secondary'}>
                      {resources.status}
                    </Badge>
                  </div>
                  {resources.throttling && <Badge variant="warning">throttling</Badge>}
                </div>
              )}

              <Card padding="none" className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-left text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Queue</th>
                      <th className="px-3 py-2 font-medium">Waiting</th>
                      <th className="px-3 py-2 font-medium">Active</th>
                      <th className="px-3 py-2 font-medium">Completed</th>
                      <th className="px-3 py-2 font-medium">Failed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {queues.map((queue) => (
                      <tr key={queue.name} className="border-t border-border">
                        <td className="px-3 py-2 font-medium text-foreground">{queue.name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{queue.waiting}</td>
                        <td className="px-3 py-2 text-muted-foreground">{queue.active}</td>
                        <td className="px-3 py-2 text-muted-foreground">{queue.completed}</td>
                        <td className="px-3 py-2">
                          {queue.failed > 0 ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="p-0 h-auto"
                              onClick={() => setFailedQueue(queue.name)}
                              title="View the failure reason for each failed job"
                            >
                              <Badge variant="danger">{queue.failed}</Badge>
                            </Button>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </>
          )}
        </CardContent>
      </Card>

      {/* Maintenance */}
      <Card>
        <CardHeader>
          <CardTitle>Maintenance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4 justify-between items-center">
            <div className="flex gap-3 items-start">
              <RefreshCw className="mt-0.5 w-5 h-5 text-amber-500" />
              <div>
                <p className="font-medium text-foreground">Sync checkpoints</p>
                <p className="text-sm text-muted-foreground">
                  {checkpointsQuery.isLoading
                    ? 'Loading…'
                    : `${checkpointCount} checkpoint${checkpointCount === 1 ? '' : 's'} stored. Clearing forces a full re-sync on the next poll.`}
                </p>
              </div>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirm('clear-checkpoints')}
              disabled={checkpointCount === 0}
            >
              Clear all
            </Button>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirm === 'clear-checkpoints'}
        onOpenChange={(open) => {
          if (!open) {
            setConfirm(null);
          }
        }}
        onConfirm={handleClearCheckpoints}
        variant="danger"
        confirmText="Clear checkpoints"
        title="Clear all sync checkpoints?"
        description="Every source will re-sync from scratch on its next poll. This can cause a burst of reprocessing."
      />

      <Dialog open={!!failedQueue} onOpenChange={(open) => !open && setFailedQueue(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Failed jobs — {failedQueue}</DialogTitle>
            <DialogClose onClose={() => setFailedQueue(null)} />
          </DialogHeader>
          {failedJobsQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : failedJobsQuery.isError ? (
            <p className="py-4 text-sm text-red-600 dark:text-red-400">
              Could not load failed jobs. Please try again.
            </p>
          ) : (failedJobsQuery.data ?? []).length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">No failed jobs found.</p>
          ) : (
            <ul className="space-y-3 max-h-[60vh] overflow-y-auto">
              {(failedJobsQuery.data ?? []).map((job) => (
                <li key={job.id ?? job.name} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap justify-between gap-x-3 text-xs text-muted-foreground">
                    <span>
                      #{job.id ?? '?'} · {job.name} · attempt {job.attemptsMade}
                      {job.organizationId ? ` · org ${job.organizationId}` : ''}
                    </span>
                    {job.failedAt ? (
                      <span>{formatDate(new Date(job.failedAt).toISOString())}</span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm font-medium text-red-600 break-words dark:text-red-400">
                    {job.failedReason ?? 'Unknown error'}
                  </p>
                  {job.stacktrace.length > 0 ? (
                    <details className="mt-1">
                      <summary className="text-xs cursor-pointer text-muted-foreground">
                        Stacktrace
                      </summary>
                      <pre className="mt-1 text-xs whitespace-pre-wrap overflow-x-auto">
                        {job.stacktrace.join('\n')}
                      </pre>
                    </details>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <GlobalAdminMembershipsCard />
    </div>
  );
};
