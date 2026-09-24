import { useState } from 'react';
import { Users } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Spinner } from '@/components/ui/Spinner';
import { Tooltip } from '@/components/ui/Tooltip';
import { usePlatformWorkspaceHealth } from '@/hooks/usePlatformAdmin';
import type { WorkspaceHealthRow } from '@/services/platform.service';
import {
  mailboxState,
  oldestWaiting,
  queueBreakdown,
  sortWorkspaces,
  truncationNote,
  type Tone,
} from '@/components/console/workspaceHealth.format';

/**
 * Platform console → System → By workspace.
 *
 * The per-workspace half of Resources & queues: each workspace's jobs (waiting, running, delayed,
 * failed) and the state of its mailboxes, rows with a problem first; Details opens which queue and
 * which mailbox. CPU and memory stay box-wide above — every workspace shares one process.
 *
 * Renders nothing on a backend without the endpoint (the service returns null on 404).
 */
const TONE_BADGE: Record<Exclude<Tone, 'default'>, 'danger' | 'warning' | 'secondary'> = {
  danger: 'danger',
  warning: 'warning',
  muted: 'secondary',
};

const Count = ({ value, tone }: { value: number; tone?: 'danger' }) =>
  value === 0 ? (
    <span className="text-muted-foreground">0</span>
  ) : tone ? (
    <Badge variant={tone} size="sm">
      {value}
    </Badge>
  ) : (
    <span className="font-medium text-foreground">{value}</span>
  );

const MailboxSummary = ({ row }: { row: WorkspaceHealthRow }) => {
  if (row.mailboxError) {
    return (
      <Badge variant="danger" size="sm">
        Mailboxes unreadable
      </Badge>
    );
  }
  if (row.mailboxes.length === 0) return <span className="text-muted-foreground">None</span>;
  const problems = row.mailboxes.filter((mailbox) => mailboxState(mailbox).problem).length;
  return problems > 0 ? (
    <Badge variant="warning" size="sm">
      {problems} of {row.mailboxes.length} with a problem
    </Badge>
  ) : (
    <span className="text-muted-foreground">{row.mailboxes.length} · no problem reported</span>
  );
};

const WorkspaceDetail = ({ row }: { row: WorkspaceHealthRow }) => (
  <div className="space-y-4">
    <section>
      <h3 className="mb-2 text-xs font-medium uppercase text-muted-foreground">Jobs by queue</h3>
      <DataTable
        rows={queueBreakdown(row)}
        rowKey={(queue) => queue.name}
        pagination={{ mode: 'client', pageSize: 25 }}
        empty={{ message: 'No jobs in any queue.' }}
        columns={[
          {
            id: 'queue',
            header: 'Queue',
            card: 'title',
            cell: (queue) => <code className="text-xs">{queue.name}</code>,
          },
          { id: 'queued', header: 'Waiting', cell: (queue) => queue.queued },
          { id: 'active', header: 'Running', cell: (queue) => queue.active },
          { id: 'delayed', header: 'Delayed', cell: (queue) => queue.delayed },
          {
            id: 'failed',
            header: 'Failed',
            cell: (queue) => <Count value={queue.failed} tone="danger" />,
          },
        ]}
      />
    </section>
    <section>
      <h3 className="mb-2 text-xs font-medium uppercase text-muted-foreground">Mailboxes</h3>
      {row.mailboxError ? (
        <Alert variant="danger">
          This workspace&apos;s mailboxes could not be read: {row.mailboxError}
        </Alert>
      ) : row.mailboxes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No mailbox connected.</p>
      ) : (
        <ul className="space-y-3 text-sm">
          {row.mailboxes.map((mailbox) => {
            const state = mailboxState(mailbox);
            return (
              <li key={mailbox.sourceId}>
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="font-medium">{mailbox.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {mailbox.type === 'gmail' ? 'Gmail' : 'IMAP'}
                  </span>
                  {state.tone === 'default' ? (
                    <span className="text-muted-foreground">{state.label}</span>
                  ) : (
                    <Badge variant={TONE_BADGE[state.tone]} size="sm">
                      {state.label}
                    </Badge>
                  )}
                </div>
                {state.detail && <p className="text-xs text-muted-foreground">{state.detail}</p>}
                {state.errors.length > 0 && (
                  <ul className="pl-4 mt-1 text-xs list-disc text-muted-foreground">
                    {state.errors.map((sample) => (
                      <li key={sample.message}>
                        {sample.message} ×{sample.count}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  </div>
);

export const WorkspaceHealthCard = () => {
  const query = usePlatformWorkspaceHealth();
  const [openId, setOpenId] = useState<number | null>(null);

  // An older backend: nothing to say, and saying nothing is not saying "healthy".
  if (query.data === null) return null;

  const report = query.data;
  const rows = report ? sortWorkspaces(report.workspaces) : [];
  const note = report ? truncationNote(report) : null;
  const unattributed = report?.unattributed ?? null;
  const opened = rows.find((row) => row.organizationId === openId) ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex gap-2 items-center">
          <Users className="w-5 h-5 text-muted-foreground" />
          By workspace
        </CardTitle>
        <CardDescription>
          Each workspace&apos;s jobs and mailboxes, problems first. CPU and memory above are for the
          whole server — every workspace shares it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {query.isLoading ? (
          <Spinner size={20} />
        ) : (
          <>
            {note && <Alert variant="warning">{note}</Alert>}
            <DataTable<WorkspaceHealthRow>
              rows={rows}
              rowKey={(row) => row.organizationId}
              isError={query.isError}
              onRetry={() => void query.refetch()}
              pagination={{ mode: 'client', pageSize: 25 }}
              empty={{ message: 'No workspaces.' }}
              actionsLabel="Details"
              actions={(row) => (
                <Button variant="secondary" size="sm" onClick={() => setOpenId(row.organizationId)}>
                  Details
                </Button>
              )}
              columns={[
                {
                  id: 'workspace',
                  header: 'Workspace',
                  card: 'title',
                  cell: (row) => (
                    <>
                      <span className="font-medium">{row.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        #{row.organizationId}
                      </span>
                      {!row.active && (
                        <Badge variant="secondary" size="sm" className="ml-2">
                          Deactivated
                        </Badge>
                      )}
                    </>
                  ),
                },
                {
                  id: 'queued',
                  header: 'Waiting',
                  cell: (row) => <Count value={row.jobs.queued} />,
                },
                {
                  id: 'active',
                  header: 'Running',
                  cell: (row) => <Count value={row.jobs.active} />,
                },
                {
                  id: 'delayed',
                  header: (
                    <Tooltip content="Waiting for a set time before running: a retry after a failure, or a deliberate wait">
                      <span>Delayed</span>
                    </Tooltip>
                  ),
                  cell: (row) => <Count value={row.jobs.delayed} />,
                },
                {
                  id: 'failed',
                  header: 'Failed',
                  cell: (row) => <Count value={row.jobs.failed} tone="danger" />,
                },
                { id: 'oldest', header: 'Oldest waiting', cell: (row) => oldestWaiting(row) },
                {
                  id: 'mailboxes',
                  header: 'Mailboxes',
                  cell: (row) => <MailboxSummary row={row} />,
                },
              ]}
            />
            {unattributed && (
              <p className="text-xs text-muted-foreground">
                Jobs for no single workspace (e.g. the scheduled check of all mailboxes):{' '}
                {unattributed.queued} waiting, {unattributed.active} running, {unattributed.delayed}{' '}
                delayed, {unattributed.failed} failed.
              </p>
            )}
          </>
        )}
      </CardContent>
      <Dialog open={opened !== null} onOpenChange={(open) => !open && setOpenId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {opened?.name}{' '}
              <span className="text-sm font-normal text-muted-foreground">
                #{opened?.organizationId}
              </span>
            </DialogTitle>
          </DialogHeader>
          {opened && <WorkspaceDetail row={opened} />}
        </DialogContent>
      </Dialog>
    </Card>
  );
};
