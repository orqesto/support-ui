import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { platformService } from '@/services/platform.service';

/** The server's default: a read past five minutes is stuck, not busy. */
export const CANCEL_LONG_READS_MINUTES = 5;

/**
 * Console → System: end this app's reads that have run for more than five minutes. On taco
 * (2026-10-28) list and count reads ran 13–41 min after their browsers had gone, and nothing short
 * of database access could stop them. Writes and other tools' sessions are never touched.
 */
export const CancelLongReadsButton = ({ longestSeconds }: { longestSeconds: number | null }) => {
  const [confirming, setConfirming] = useState(false);
  const queryClient = useQueryClient();
  const cancel = useMutation({
    mutationFn: () => platformService.cancelLongReads(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['platform', 'queue-status'] }),
  });
  const stuck = (longestSeconds ?? 0) >= CANCEL_LONG_READS_MINUTES * 60;

  return (
    <div className="flex flex-wrap gap-3 items-center text-xs">
      <Button
        size="sm"
        variant="outline"
        disabled={!stuck || cancel.isPending}
        onClick={() => setConfirming(true)}
      >
        {cancel.isPending
          ? 'Stopping…'
          : `Stop reads running over ${CANCEL_LONG_READS_MINUTES} min`}
      </Button>
      <span className="text-muted-foreground">
        {cancel.isSuccess
          ? cancel.data.cancelled === 0
            ? 'Nothing to stop: no read had run that long.'
            : `Stopped ${cancel.data.cancelled} ${cancel.data.cancelled === 1 ? 'read' : 'reads'}.`
          : cancel.isError
            ? 'Could not stop them just now. Try again.'
            : stuck
              ? 'A browser that gave up does not stop its query; this does. Changes, imports and saves are never stopped.'
              : `Shown once a read has run for ${CANCEL_LONG_READS_MINUTES} minutes.`}
      </span>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Stop reads running over ${CANCEL_LONG_READS_MINUTES} minutes?`}
        description="Only this app's read queries that have run that long are stopped — usually pages nobody is waiting for any more. Someone still waiting on one sees it fail and can reload. Nothing that saves or changes data is touched."
        confirmText="Stop them"
        onConfirm={() => {
          setConfirming(false);
          cancel.mutate();
        }}
      />
    </div>
  );
};
