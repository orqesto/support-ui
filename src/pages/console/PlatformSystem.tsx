import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Cpu, KeyRound } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/Dialog';
import { Spinner } from '@/components/ui/Spinner';
import { ConsolePageHeader } from '@/components/console/ConsolePageHeader';
import { FailureAnalysisCard } from '@/components/console/FailureAnalysisCard';
import { WorkspaceHealthCard } from '@/components/console/WorkspaceHealthCard';
import { ProcessCpuTable } from '@/components/console/ProcessCpuTable';
import { QueueHistoryPanel } from '@/components/console/QueueHistoryPanel';
import {
  estimateClearTime,
  formatCpuBreakdown,
  formatCpuFigures,
  formatDuration,
  formatMemoryBreakdown,
  formatMemoryFigures,
  formatOldestWaiting,
  queuedJobs,
} from '@/components/console/failureAnalysis.format';
import { licenseService } from '@/services/license.service';
import { platformService } from '@/services/platform.service';
import { usePlatformQueueStatus } from '@/hooks/usePlatformAdmin';

/**
 * Platform console → System. Genuinely PLATFORM-level health that already has global-admin
 * (`/api/admin/*`) endpoints: license status, resource/queue health, workspace health and
 * failure analysis. Things an operator RUNS (sync-checkpoint clearing, global-admin membership
 * clean-up, background jobs, repairs) live on Console → Maintenance (2026-10-20). Deliberately does NOT reuse the workspace
 * `SystemManagementSettings` (its "delete everything for your workspace" ops are per-org
 * and meaningless without an org context, which platform scope suppresses).
 *
 * The all-org "migrate storage" action was removed: it POSTed no target backend (a hard
 * 400) and is a dangerous bulk op not needed for current deployments. A proper version
 * needs a target-backend picker before it comes back.
 */

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

/** The cap `platformService.getQueueFailedJobs` applies. */
const FAILED_JOBS_LIMIT = 20;

export const PlatformSystem = () => {
  const licenseQuery = useQuery({
    queryKey: ['platform', 'license-status'],
    queryFn: () => licenseService.getLicenseStatus(),
    refetchOnWindowFocus: false,
  });
  const queueQuery = usePlatformQueueStatus();


  // Failed-jobs drill-down: clicking a queue's failed count loads the actual errors.
  const [failedQueue, setFailedQueue] = useState<string | null>(null);
  const failedJobsQuery = useQuery({
    queryKey: ['platform', 'queue-failed', failedQueue],
    queryFn: () => platformService.getQueueFailedJobs(failedQueue as string),
    enabled: !!failedQueue,
    refetchOnWindowFocus: false,
  });

  const resources = queueQuery.data?.resources;
  const queues = queueQuery.data?.queues ?? [];

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
            <KeyRound className="w-5 h-5 text-muted-foreground" />
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
                <p className="font-mono font-medium text-foreground">
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
            <Activity className="w-5 h-5 text-muted-foreground" />
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
                    {formatCpuFigures(resources) ? (
                      <span className="text-xs text-muted-foreground">{formatCpuFigures(resources)}</span>
                    ) : null}
                  </div>
                  <div className="flex gap-2 items-center">
                    <span className="text-muted-foreground">Memory</span>
                    <span className="font-medium text-foreground">{resources.memory}</span>
                    {formatMemoryFigures(resources.memoryMB) ? (
                      <span className="text-xs text-muted-foreground">
                        {formatMemoryFigures(resources.memoryMB)}
                      </span>
                    ) : null}
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
              {resources && formatCpuBreakdown(resources) ? (
                <p className="text-xs text-muted-foreground">CPU in cores: {formatCpuBreakdown(resources)}.</p>
              ) : null}
              {resources && formatMemoryBreakdown(resources.process) ? (
                <p className="text-xs text-muted-foreground">
                  Resident memory: {formatMemoryBreakdown(resources.process)}. Native memory is what
                  a locally loaded embedding model occupies; it does not shrink when the queues are idle.
                </p>
              ) : null}
              <ProcessCpuTable report={resources?.processes} />

              <Card padding="none" className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-left text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Queue</th>
                      <th className="px-3 py-2 font-medium">Waiting</th>
                      <th className="px-3 py-2 font-medium">Active</th>
                      <th className="px-3 py-2 font-medium">Completed</th>
                      <th className="px-3 py-2 font-medium">Failed</th>
                      <th className="px-3 py-2 font-medium">Typical job</th>
                      <th className="px-3 py-2 font-medium">Waited</th>
                      <th className="px-3 py-2 font-medium">Oldest waiting</th>
                      <th className="px-3 py-2 font-medium">Clears in</th>
                    </tr>
                  </thead>
                  <tbody>
                    {queues.map((queue) => (
                      <tr key={queue.name} className="border-t border-border">
                        <td className="px-3 py-2 font-medium text-foreground">{queue.name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{queuedJobs(queue)}</td>
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
                        <td
                          className="px-3 py-2 text-muted-foreground"
                          title={
                            typeof queue.timing?.slowestRunMs === 'number'
                              ? `Slowest of the last ${queue.timing.sampled}: ${formatDuration(queue.timing.slowestRunMs)}`
                              : undefined
                          }
                        >
                          {formatDuration(queue.timing?.medianRunMs)}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {formatDuration(queue.timing?.medianWaitMs)}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{formatOldestWaiting(queue)}</td>
                        <td className="px-3 py-2 text-muted-foreground">{estimateClearTime(queue) ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
              {queues.some((queue) => queue.timing) ? (
                <p className="text-xs text-muted-foreground">
                  Typical job and Waited are the median of each queue&apos;s most recent finished jobs
                  (up to 20; finished jobs are kept for about an hour); a CPU-heavy job&apos;s time
                  includes waiting for a free core. Oldest waiting is measured. Clears in is the waiting
                  jobs at the pace the queue finished jobs over the last hour (up to its last 100),
                  measured up to now — an estimate that names the history it rests on; quiet spells
                  make it read long, and one burst on little history can make it read short.
                </p>
              ) : null}
              {queues.length > 0 ? <QueueHistoryPanel queues={queues} /> : null}
            </>
          )}
        </CardContent>
      </Card>


      <WorkspaceHealthCard />
      <FailureAnalysisCard />
      <Dialog open={!!failedQueue} onOpenChange={(open) => !open && setFailedQueue(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Failed jobs — {failedQueue}</DialogTitle>
            {/* The badge that opens this dialog shows the TRUE failed count; the endpoint
                returns at most 20. Say so, rather than letting the two disagree silently. */}
            {(failedJobsQuery.data ?? []).length >= FAILED_JOBS_LIMIT && (
              <p className="text-xs text-muted-foreground">
                Showing the {FAILED_JOBS_LIMIT} most recent.
              </p>
            )}
            <DialogClose onClose={() => setFailedQueue(null)} />
          </DialogHeader>
          {failedJobsQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : failedJobsQuery.isError ? (
            <p className="py-4 text-sm text-destructive">
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
                      <span className="font-mono">{formatDate(new Date(job.failedAt).toISOString())}</span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm font-medium text-destructive break-words">
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

    </div>
  );
};
