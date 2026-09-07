import { useState } from 'react';
import { Database, RefreshCw, Trash2, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { ConsoleLoading } from '@/components/console/ConsoleLoading';
import { describeMove, STATUS_BADGE, STATUS_LABEL } from '@/components/settings/providers/DatabaseConfigCard';
import {
  useConfirmDatabaseCleanup,
  useMigrateWorkspaceDatabase,
  useReverifyWorkspaceDatabase,
  useWorkspaceDatabase,
  useWorkspaceDatabaseMove,
} from '@/hooks/useDatabaseConsole';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { toast } from '@/lib/toast';
import { formatDate } from '@/lib/utils';

type Props = {
  org: { id: number; name: string } | null;
  onClose: () => void;
};

/**
 * Platform console → Workspaces → Database (BYODB Phase 2 §3.3 / §3.5). The same read-only
 * model as the workspace's own card — host masked, never the URL — plus the three operator
 * actions: Re-verify, Run migrations, and the cleanup confirmation that deletes a moved
 * workspace's rows from the managed database. The last one is the only destructive step in
 * the whole move and it is deliberately a human's click, here, after re-verification.
 */
export const WorkspaceDatabaseDialog = ({ org, onClose }: Props) => {
  const organizationId = org?.id ?? null;
  const database = useWorkspaceDatabase(organizationId);
  const move = useWorkspaceDatabaseMove(organizationId);
  const reverify = useReverifyWorkspaceDatabase();
  const migrate = useMigrateWorkspaceDatabase();
  const cleanup = useConfirmDatabaseCleanup();
  const [cleanupOpen, setCleanupOpen] = useState(false);

  if (!org) return null;
  const display = database.data;
  const own = display?.mode === 'own';
  const latestMove = move.data ?? null;
  const cleanupReady = latestMove?.status === 'copied' && !latestMove.cleanedAt;
  const tables = latestMove?.tables ? Object.entries(latestMove.tables) : [];

  const handleReverify = () =>
    reverify.mutate(org.id, {
      onSuccess: (result) =>
        result.probe?.ok
          ? toast.success(`${org.name}'s database answered in ${result.probe.latencyMs}ms.`)
          : toast.error(`${org.name}'s database did not answer: ${result.probe?.error ?? 'connection failed'}`),
      onError: (error) => toast.error(getApiErrorMessage(error) ?? 'Could not verify the database'),
    });

  const handleMigrate = () =>
    migrate.mutate(org.id, {
      onSuccess: (result) =>
        toast.success(
          `${result.migrationsApplied ?? 0} migration${result.migrationsApplied === 1 ? '' : 's'} applied · schema ${result.display.schemaVersion ?? 'unknown'}`
        ),
      onError: (error) => toast.error(getApiErrorMessage(error) ?? 'Migrations failed on the workspace database'),
    });

  const handleCleanup = () =>
    cleanup.mutate(org.id, {
      onSuccess: () => toast.success(`${org.name}'s rows were removed from the managed database.`),
      onError: (error) => toast.error(getApiErrorMessage(error) ?? 'Cleanup refused'),
    });

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()} size="lg">
      <DialogHeader>
        <DialogTitle>
          <span className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            {org.name} — database
          </span>
        </DialogTitle>
        <DialogClose onClose={onClose} />
      </DialogHeader>
      <DialogContent className="space-y-5">
        {database.isLoading ? (
          <ConsoleLoading />
        ) : database.isError || !display ? (
          <p className="text-sm text-destructive">
            {getApiErrorMessage(database.error) ?? 'Could not load the workspace database.'}
          </p>
        ) : (
          <>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
              <dt className="text-muted-foreground">Runs on</dt>
              <dd className="flex items-center gap-2 text-foreground">
                {own ? 'Its own Postgres' : "Odly's managed database"}
                {own && (
                  <Badge variant={STATUS_BADGE[display.status]} size="sm">
                    {STATUS_LABEL[display.status]}
                  </Badge>
                )}
              </dd>
              {own && (
                <>
                  <dt className="text-muted-foreground">Host</dt>
                  <dd className="font-mono text-xs text-foreground break-all">{display.hostMasked ?? '—'}</dd>
                  <dt className="text-muted-foreground">Set up via</dt>
                  <dd className="text-foreground">
                    {display.provenance === 'env' ? 'Environment reference (ops)' : 'Settings card (encrypted URL)'}
                  </dd>
                  <dt className="text-muted-foreground">Region label</dt>
                  <dd className="text-foreground">{display.region ?? '—'}</dd>
                  <dt className="text-muted-foreground">Schema version</dt>
                  <dd className="text-foreground">{display.schemaVersion ?? 'Not migrated yet'}</dd>
                  <dt className="text-muted-foreground">Last verified</dt>
                  <dd className="text-foreground">{display.verifiedAt ? formatDate(display.verifiedAt) : 'Never'}</dd>
                </>
              )}
              {!own && (
                <>
                  <dt className="text-muted-foreground">Retention deadline</dt>
                  <dd className="text-foreground">
                    {display.sharedRetentionUntil
                      ? `${formatDate(display.sharedRetentionUntil)} (Free on managed — §3.4)`
                      : 'None (entitled to the managed database)'}
                  </dd>
                </>
              )}
            </dl>

            {own && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={handleReverify} isLoading={reverify.isPending}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Re-verify
                </Button>
                <Button variant="outline" size="sm" onClick={handleMigrate} isLoading={migrate.isPending}>
                  <Wrench className="mr-2 h-4 w-4" />
                  Run migrations
                </Button>
              </div>
            )}

            <section className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm">
              <h3 className="font-medium text-foreground">Data move</h3>
              {move.isLoading ? (
                <p className="text-muted-foreground">Loading…</p>
              ) : !latestMove ? (
                <p className="text-muted-foreground">No move has been run for this workspace.</p>
              ) : (
                <>
                  <p className="text-foreground" data-testid="console-move-status">
                    {describeMove(latestMove)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Started {latestMove.startedAt ? formatDate(latestMove.startedAt) : '—'} · finished{' '}
                    {latestMove.finishedAt ? formatDate(latestMove.finishedAt) : '—'}
                    {latestMove.cleanedAt && ` · cleaned ${formatDate(latestMove.cleanedAt)}`}
                  </p>
                  {tables.length > 0 && (
                    <div className="max-h-56 overflow-auto rounded border bg-background">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-muted text-left text-muted-foreground">
                          <tr>
                            <th className="px-2 py-1 font-medium">Table</th>
                            <th className="px-2 py-1 text-right font-medium">Managed</th>
                            <th className="px-2 py-1 text-right font-medium">Copied</th>
                            <th className="px-2 py-1 text-right font-medium">Own DB</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tables.map(([table, counts]) => {
                            const mismatch = counts.target !== null && counts.target !== counts.source;
                            return (
                              <tr key={table} className={mismatch ? 'text-destructive' : ''}>
                                <td className="px-2 py-0.5 font-mono">{table}</td>
                                <td className="px-2 py-0.5 text-right">{counts.source.toLocaleString()}</td>
                                <td className="px-2 py-0.5 text-right">{counts.copied.toLocaleString()}</td>
                                <td className="px-2 py-0.5 text-right">{counts.target === null ? '—' : counts.target.toLocaleString()}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {cleanupReady && (
                    <div className="space-y-2 pt-1">
                      <p className="text-xs text-muted-foreground">
                        The workspace already runs on its own database. Confirming re-verifies every
                        table's count there and then deletes this workspace's rows from the managed
                        database. There is no undo.
                      </p>
                      <Button variant="destructive" size="sm" onClick={() => setCleanupOpen(true)} isLoading={cleanup.isPending}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete managed copy
                      </Button>
                    </div>
                  )}
                </>
              )}
            </section>
          </>
        )}
      </DialogContent>

      <ConfirmDialog
        open={cleanupOpen}
        onOpenChange={setCleanupOpen}
        onConfirm={handleCleanup}
        title={`Delete ${org.name}'s rows from the managed database?`}
        description="The rows are re-verified against the workspace's own database first; if any table's count differs the deletion is refused. Otherwise every tenant-table row for this workspace is removed from the managed database and cannot be recovered from Odly."
        confirmText="Re-verify and delete"
        cancelText="Keep the copy"
        variant="danger"
      />
    </Dialog>
  );
};
