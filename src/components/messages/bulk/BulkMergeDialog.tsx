import { useEffect, useState } from 'react';
import { logger } from '@/lib/logger';
import { conversationMergeService } from '@/services/conversationMerge.service';
import { messageService } from '@/services/message.service';
import type { Message } from '@/types';
import { MergeConfirmDialog, type MergeRow } from '../MergeConfirmDialog';

/** The backend merges at most this many conversations into one in a request. */
export const BULK_MERGE_MAX = 21;

type Props = {
  open: boolean;
  selectedIds: number[];
  onOpenChange: (open: boolean) => void;
  onMerged: (survivor: MergeRow) => void;
};

/**
 * Merge from the bulk bar: the SAME confirm dialog as the thread view, fed with the selected
 * tickets. The selection is only ids (the board and the list page rows independently), so each
 * ticket is read fresh — which also means the dialog shows what is true now, not a stale card.
 */
export const BulkMergeDialog = ({ open, selectedIds, onOpenChange, onMerged }: Props) => {
  const [rows, setRows] = useState<MergeRow[]>([]);
  const [failed, setFailed] = useState(false);
  /**
   * Skew guard: the FE deploys before the BE ships, and an older backend has no merge route. The
   * thread panel hides itself on that answer; the bulk bar cannot know in advance, so the dialog
   * asks before offering Merge — rather than letting the agent press it into a 404.
   */
  const [unavailable, setUnavailable] = useState(false);

  const key = selectedIds.join(',');
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setRows([]);
    setFailed(false);
    setUnavailable(false);
    const probe = selectedIds[0];
    void Promise.all([
      Promise.allSettled(selectedIds.map((id) => messageService.getById(id))),
      probe === undefined ? Promise.resolve([]) : conversationMergeService.listMerges(probe),
    ]).then(([results, merges]) => {
      if (cancelled) return;
      if (merges === null) {
        setUnavailable(true);
        return;
      }
      const loaded = results
        .map((result) =>
          result.status === 'fulfilled'
            ? (result.value?.data as unknown as Message | undefined)
            : undefined
        )
        .filter((row): row is Message => !!row);
      // ⛔ All or nothing, like the merge itself: merging "the ones that loaded" would silently
      // leave a selected ticket out of a merge the agent believes included it.
      if (loaded.length !== selectedIds.length) {
        logger.error('Bulk merge: could not read every selected ticket', {
          selected: selectedIds.length,
          loaded: loaded.length,
        });
        setFailed(true);
        return;
      }
      setRows(loaded);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, open]);

  if (unavailable && open) {
    return (
      <MergeConfirmDialog
        open
        rows={[]}
        onOpenChange={onOpenChange}
        onMerged={onMerged}
        notice="Merging is not available on this server yet, or it could not be reached. Nothing was changed."
      />
    );
  }

  if (failed && open) {
    return (
      <MergeConfirmDialog
        open
        rows={[]}
        onOpenChange={onOpenChange}
        onMerged={onMerged}
        notice="Some of the selected tickets could not be read just now, so nothing can be merged. Close and try again."
      />
    );
  }

  return (
    <MergeConfirmDialog
      open={open}
      rows={rows}
      onOpenChange={onOpenChange}
      onMerged={onMerged}
      notice={
        rows.length === 0
          ? 'Reading the selected tickets…'
          : new Set(rows.map((row) => (row as Message).channel)).size > 1
            ? 'These tickets arrived on different channels and cannot be merged.'
            : undefined
      }
    />
  );
};
