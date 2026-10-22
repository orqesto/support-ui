/**
 * "Removed automatically": entries the nightly run hid, newest first, each with Restore.
 * A removed entry is deleted for good after 90 days unless restored.
 */
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type ColumnDef } from '@/components/ui/DataTable';
import { apiErrorMessage, apiErrorStatus } from '@/lib/apiError';
import { qualityReasonLabel } from '@/lib/kbQuality';
import { toast } from '@/lib/toast';
import {
  kbAutoActionsService,
  type KbAutoRemovedItem,
  type KbAutoRemovedPage,
} from '@/services/kbAutoActions.service';
import { formatPercent, formatWhen, preview } from './kbAutoFormat';

type Props = {
  /** Changes when the overview is re-read, so this list re-reads too. */
  refreshKey: number;
  /** Called after a restore, so the overview's counts update. */
  onRestored: () => void;
};

/** Copy for a refusal whose body carried no message of its own. */
const restoreFallback = (status: number | undefined): string => {
  if (status === 404)
    return 'This entry no longer exists (it may already have been deleted for good).';
  if (status === 409) return 'This entry was already restored, or was not removed automatically.';
  if (status === 403) return 'You cannot restore entries of this team.';
  return 'Please try again.';
};

export const KbAutoRemovedList = ({ refreshKey, onRestored }: Props) => {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<KbAutoRemovedPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [pending, setPending] = useState<KbAutoRemovedItem | null>(null);

  const load = useCallback(async (target: number) => {
    setLoading(true);
    setError(false);
    try {
      setData(await kbAutoActionsService.listRemoved(target));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(page);
  }, [load, page, refreshKey]);

  const restore = async (item: KbAutoRemovedItem) => {
    setPending(null);
    try {
      await kbAutoActionsService.restore(item.entryId);
      toast.success('Entry restored', { description: 'It is back in the knowledge base.' });
      onRestored();
      await load(page);
    } catch (err) {
      toast.error('Could not restore the entry', {
        description: apiErrorMessage(err, restoreFallback(apiErrorStatus(err))),
      });
    }
  };

  const columns: ColumnDef<KbAutoRemovedItem>[] = [
    {
      id: 'entry',
      header: 'Entry',
      card: 'title',
      cell: (row) => (
        <div className="max-w-md space-y-0.5">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{row.subject === 'document' ? 'Document' : 'Q&A'}</Badge>
            <span className="font-medium">{preview(row.question, 120)}</span>
          </div>
          <p className="text-xs text-muted-foreground">{preview(row.answer, 160)}</p>
        </div>
      ),
    },
    {
      id: 'when',
      header: 'Removed',
      cell: (row) => (
        <div className="text-sm">
          <div>{formatWhen(row.removedAt)}</div>
          {row.purgeAfter && (
            <div className="text-xs text-muted-foreground">
              Deleted for good after {formatWhen(row.purgeAfter)}
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'sure',
      header: '% sure',
      cell: (row) => formatPercent(row.confidence),
    },
    {
      id: 'reason',
      header: 'Reason',
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.reasons.map((reason) => (
            <Badge key={reason} variant="default">
              {qualityReasonLabel(reason)}
            </Badge>
          ))}
        </div>
      ),
    },
  ];

  const pageSize = data?.pageSize ?? 25;
  const total = data?.total ?? 0;

  return (
    <>
      <DataTable
        rows={data?.items ?? []}
        rowKey={(row) => row.entryId}
        columns={columns}
        actionsLabel="Restore"
        actions={(row) => (
          <Button variant="outline" size="sm" onClick={() => setPending(row)}>
            Restore
          </Button>
        )}
        pagination={{
          mode: 'server',
          page,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
          total,
          limit: pageSize,
          onPageChange: setPage,
          loading,
        }}
        isError={error}
        onRetry={() => void load(page)}
        empty={{ message: 'Nothing has been removed automatically.' }}
      />
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        onConfirm={() => {
          if (pending) void restore(pending);
        }}
        title="Restore this entry?"
        description="It comes back into the knowledge base as it was before the automatic removal."
        confirmText="Restore"
      />
    </>
  );
};
