import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Activity, Cpu, HardDriveDownload, KeyRound, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Spinner } from '@/components/ui/Spinner';
import { licenseService } from '@/services/license.service';
import {
  usePlatformQueueStatus,
  usePlatformSyncCheckpoints,
  useClearSyncCheckpoints,
  useMigrateAllStorage,
} from '@/hooks/usePlatformAdmin';

/**
 * Platform console → System. Genuinely PLATFORM-level operational tools that already
 * have global-admin (`/api/admin/*`) endpoints: license status, resource/queue health,
 * sync-checkpoint management and the all-org storage migration. Deliberately does NOT
 * reuse the workspace `SystemManagementSettings` (its "delete everything for your
 * workspace" ops are per-org and meaningless without an org context, which platform scope
 * suppresses).
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

export const PlatformSystem = () => {
  const licenseQuery = useQuery({
    queryKey: ['platform', 'license-status'],
    queryFn: () => licenseService.getLicenseStatus(),
    refetchOnWindowFocus: false,
  });
  const queueQuery = usePlatformQueueStatus();
  const checkpointsQuery = usePlatformSyncCheckpoints();
  const clearCheckpoints = useClearSyncCheckpoints();
  const migrateStorage = useMigrateAllStorage();

  const [confirm, setConfirm] = useState<null | 'clear-checkpoints' | 'migrate-storage'>(null);

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

  const handleMigrateStorage = async () => {
    try {
      const result = await migrateStorage.mutateAsync();
      toast.success(result.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not start migration');
    } finally {
      setConfirm(null);
    }
  };

  const resources = queueQuery.data?.resources;
  const queues = queueQuery.data?.queues ?? [];
  const checkpointCount = checkpointsQuery.data?.length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">System</h1>
        <p className="text-sm text-muted-foreground">
          Platform-level operations and health. Workspace-specific cleanup lives in each
          workspace&apos;s own settings.
        </p>
      </div>

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
                            <Badge variant="danger">{queue.failed}</Badge>
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

          <div className="flex flex-wrap gap-4 justify-between items-center pt-4 border-t border-border">
            <div className="flex gap-3 items-start">
              <HardDriveDownload className="mt-0.5 w-5 h-5 text-primary" />
              <div>
                <p className="font-medium text-foreground">Migrate all storage</p>
                <p className="text-sm text-muted-foreground">
                  Move every organization not already on the target backend to it.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirm('migrate-storage')}
              isLoading={migrateStorage.isPending}
            >
              Run migration
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

      <ConfirmDialog
        open={confirm === 'migrate-storage'}
        onOpenChange={(open) => {
          if (!open) {
            setConfirm(null);
          }
        }}
        onConfirm={handleMigrateStorage}
        confirmText="Run migration"
        title="Migrate all organization storage?"
        description="This fans a storage migration out across every organization not already on the target backend. It runs in the background."
      />
    </div>
  );
};
