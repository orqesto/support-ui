import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { slaService } from '@/features/statistics/services/sla.service';
import { usePermissions } from '@/hooks/usePermissions';
import { toast } from '@/lib/toast';

export const SLA_STATS_SINCE_KEY = ['sla-stats-since'] as const;

const formatSince = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/**
 * "Start over" for SLA Performance (owner 2026-11-09): every figure on the page counts from this
 * moment. Nothing is deleted — "Count everything" brings the history back. Everyone sees the date;
 * only an org admin can move it.
 */
export const SLAStatsSinceControl = () => {
  const queryClient = useQueryClient();
  const { isOrgAdmin } = usePermissions();
  const [confirming, setConfirming] = useState(false);
  const {
    data: since,
    isLoading,
    isError,
  } = useQuery({
    queryKey: SLA_STATS_SINCE_KEY,
    queryFn: slaService.getStatsSince,
  });
  const mutation = useMutation({
    mutationFn: slaService.setStatsSince,
    onSuccess: async (saved) => {
      queryClient.setQueryData(SLA_STATS_SINCE_KEY, saved);
      await queryClient.invalidateQueries({
        // Every SLA figure on the page (their keys start with 'sla-'), not this date: it is set above.
        predicate: (query) =>
          typeof query.queryKey[0] === 'string' &&
          query.queryKey[0].startsWith('sla-') &&
          query.queryKey[0] !== SLA_STATS_SINCE_KEY[0],
      });
      toast.success(
        saved ? 'SLA Performance now counts from today' : 'SLA Performance counts everything again'
      );
    },
    onError: () => toast.error('Could not change where SLA Performance counts from'),
  });

  // A backend without the setting (older than 0230) answers 404: show nothing rather than a
  // button that cannot work.
  if (isLoading || isError) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <span>{since ? `Counting from ${formatSince(since)}` : 'Counting all history'}</span>
      {isOrgAdmin && (
        <>
          <Button
            variant="outline"
            size="sm"
            disabled={mutation.isPending}
            onClick={() => setConfirming(true)}
          >
            Start over from now
          </Button>
          {since && (
            <Button
              variant="ghost"
              size="sm"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate(null)}
            >
              Count everything
            </Button>
          )}
        </>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Start SLA Performance over?"
        description="Every figure on this page will count only customer waits from this moment on. Nothing is deleted: “Count everything” brings the earlier history back."
        confirmText="Start over"
        onConfirm={() => {
          setConfirming(false);
          mutation.mutate('now');
        }}
      />
    </div>
  );
};
