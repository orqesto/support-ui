import { useState } from 'react';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { usePlatformSyncCheckpoints, useClearSyncCheckpoints } from '@/hooks/usePlatformAdmin';

/** Mail sync checkpoints: how many are stored, and clearing them all (a full re-sync). */
export const SyncCheckpointsCard = () => {
  const checkpointsQuery = usePlatformSyncCheckpoints();
  const clearCheckpoints = useClearSyncCheckpoints();
  const [confirming, setConfirming] = useState(false);

  const handleClearCheckpoints = async () => {
    try {
      const result = await clearCheckpoints.mutateAsync();
      toast.success(`Cleared ${result.count} checkpoint${result.count === 1 ? '' : 's'}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not clear checkpoints');
    } finally {
      setConfirming(false);
    }
  };

  const checkpointCount = checkpointsQuery.data?.length ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex gap-2 items-center">
          <RefreshCw className="w-5 h-5 text-muted-foreground" />
          Sync checkpoints
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-4 justify-between items-center">
          <p className="text-sm text-muted-foreground">
            {checkpointsQuery.isLoading
              ? 'Loading…'
              : `${checkpointCount} checkpoint${checkpointCount === 1 ? '' : 's'} stored. Clearing forces a full re-sync on the next poll.`}
          </p>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirming(true)}
            disabled={checkpointCount === 0}
          >
            Clear all
          </Button>
        </div>
      </CardContent>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        onConfirm={() => void handleClearCheckpoints()}
        variant="danger"
        confirmText="Clear checkpoints"
        title="Clear all sync checkpoints?"
        description="Every source will re-sync from scratch on its next poll. This can cause a burst of reprocessing."
      />
    </Card>
  );
};
