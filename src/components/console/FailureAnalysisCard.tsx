import { useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, RotateCcw, Trash2 } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable } from '@/components/ui/DataTable';
import { Spinner } from '@/components/ui/Spinner';
import {
  usePlatformFailureAnalysis,
  useRemoveFailedJobs,
  useRetryFailedJobs,
} from '@/hooks/usePlatformAdmin';
import type { QueueFailureGroup } from '@/services/platform.service';
import {
  describeGroupAction,
  formatFailedAt,
  formatJobCount,
  formatWorkspace,
} from '@/components/console/failureAnalysis.format';

/**
 * Platform console → System → Failure analysis.
 *
 * Failed jobs from every queue, grouped by CAUSE: how many, in which queues, for which
 * workspaces, first and last seen, a few sample jobs — and Retry / Remove for the whole
 * group. Replaces reading the per-queue list one raw error at a time (on prod every
 * ai-analysis failure was one enum rejection and nobody could see that from the list).
 */
type PendingAction = { action: 'retry' | 'remove'; group: QueueFailureGroup } | null;

export const FailureAnalysisCard = () => {
  const analysisQuery = usePlatformFailureAnalysis();
  const retry = useRetryFailedJobs();
  const remove = useRemoveFailedJobs();
  const [pending, setPending] = useState<PendingAction>(null);

  const runPending = async () => {
    if (!pending) return;
    const mutation = pending.action === 'retry' ? retry : remove;
    try {
      const result = await mutation.mutateAsync(pending.group.jobs);
      const verb = pending.action === 'retry' ? 'Retried' : 'Removed';
      const skipped = result.skipped ? `, ${result.skipped} already gone` : '';
      const errors = result.errors ? `, ${result.errors} failed` : '';
      toast.success(`${verb} ${formatJobCount(result.done)}${skipped}${errors}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update failed jobs');
    } finally {
      setPending(null);
    }
  };

  const groups = analysisQuery.data?.groups ?? [];
  const truncated = analysisQuery.data?.truncatedQueues ?? [];
  const busy = retry.isPending || remove.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex gap-2 items-center">
          <AlertTriangle className="w-5 h-5 text-primary" />
          Failure analysis
        </CardTitle>
        <CardDescription>
          Failed jobs across every queue, grouped by cause. Retry a group once the cause is fixed;
          remove it when the jobs are not worth re-running.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {truncated.length > 0 ? (
          <Alert variant="warning">
            Showing the newest {analysisQuery.data?.perQueue} failures per queue; {truncated.join(', ')}{' '}
            {truncated.length === 1 ? 'has' : 'have'} more.
          </Alert>
        ) : null}
        {analysisQuery.isLoading ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : (
          <DataTable<QueueFailureGroup>
            rows={groups}
            rowKey={(group) => group.reason}
            isError={analysisQuery.isError}
            onRetry={() => void analysisQuery.refetch()}
            pagination={{ mode: 'client', pageSize: 10 }}
            empty={{ message: 'No failed jobs in any queue.' }}
            columns={[
              {
                id: 'reason',
                header: 'Cause',
                card: 'title',
                cell: (group) => (
                  <div className="max-w-xl">
                    <p className="text-sm font-medium text-red-600 break-words dark:text-red-400">
                      {group.reason}
                    </p>
                    {group.sample.length > 0 ? (
                      <details className="mt-1">
                        <summary className="text-xs cursor-pointer text-muted-foreground">
                          Sample ({group.sample.length} of {group.count})
                        </summary>
                        <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                          {group.sample.map((job) => (
                            <li key={`${job.queue}-${job.id}`}>
                              #{job.id} · {job.queue} · attempt {job.attemptsMade} ·{' '}
                              {formatWorkspace(job.organizationId)} · {formatFailedAt(job.failedAt)}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </div>
                ),
              },
              {
                id: 'count',
                header: 'Jobs',
                align: 'right',
                card: 'meta',
                cell: (group) => <span className="font-medium text-foreground">{group.count}</span>,
              },
              {
                id: 'queues',
                header: 'Queues',
                card: 'subtitle',
                cell: (group) => (
                  <div className="flex flex-wrap gap-1">
                    {group.queues.map((queue) => (
                      <Badge key={queue.name} variant="secondary">
                        {queue.name} ×{queue.count}
                      </Badge>
                    ))}
                  </div>
                ),
              },
              {
                id: 'workspaces',
                header: 'Workspaces',
                card: 'hidden',
                cell: (group) => (
                  <div className="flex flex-wrap gap-1">
                    {group.organizations.map((organization) => (
                      <Badge key={organization.id ?? 'none'} variant="default">
                        {formatWorkspace(organization.id)} ×{organization.count}
                      </Badge>
                    ))}
                  </div>
                ),
              },
              {
                id: 'first',
                header: 'First seen',
                card: 'hidden',
                cell: (group) => <span className="text-xs text-muted-foreground">{formatFailedAt(group.firstFailedAt)}</span>,
              },
              {
                id: 'last',
                header: 'Last seen',
                card: 'meta',
                cell: (group) => <span className="text-xs text-muted-foreground">{formatFailedAt(group.lastFailedAt)}</span>,
              },
            ]}
            actions={(group) => (
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => setPending({ action: 'retry', group })}
                >
                  <RotateCcw className="mr-1 w-4 h-4" />
                  Retry all
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => setPending({ action: 'remove', group })}
                >
                  <Trash2 className="mr-1 w-4 h-4" />
                  Remove all
                </Button>
              </div>
            )}
          />
        )}
      </CardContent>
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        onConfirm={() => void runPending()}
        title={pending ? describeGroupAction(pending.action, pending.group) : ''}
        description={
          pending?.action === 'retry'
            ? 'The jobs go back to waiting and run again with the current code. Retry only once the cause is fixed, or they will fail the same way.'
            : 'The jobs are deleted from their queues. The conversations keep whatever the failed attempt stored.'
        }
        confirmText={pending?.action === 'retry' ? 'Retry' : 'Remove'}
        variant={pending?.action === 'remove' ? 'danger' : 'warning'}
      />
    </Card>
  );
};
