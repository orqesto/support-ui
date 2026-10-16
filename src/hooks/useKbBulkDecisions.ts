import { useCallback, useMemo, useState } from 'react';
import { kbService, type KBEntry } from '@/services/kb.service';
import { kbQualityService } from '@/services/kbQuality.service';

export type BulkOutcome = { done: number; skipped: number; failed: number };

const BULK_KINDS = ['approve_capture', 'remove'];

const decidable = (entry: KBEntry, kind: string) =>
  entry.pendingDecision?.kind === kind && entry.pendingDecision.canDecide;

/** A row the person can decide AND a bulk action covers — the only rows given a checkbox. */
export const isBulkSelectable = (entry: KBEntry) =>
  Boolean(entry.pendingDecision?.canDecide && BULK_KINDS.includes(entry.pendingDecision.kind));

export const useKbBulkDecisions = (entries: KBEntry[], onDone: () => void) => {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

  const selectableIds = useMemo(
    () => entries.filter(isBulkSelectable).map((entry) => entry.id),
    [entries]
  );
  const toggle = useCallback(
    (id: number, on: boolean) => {
      if (on && !selectableIds.includes(id)) return;
      setSelected((prev) => {
        const next = new Set(prev);
        if (on) next.add(id);
        else next.delete(id);
        return next;
      });
    },
    [selectableIds]
  );
  const clear = useCallback(() => setSelected(new Set()), []);
  const chosen = useMemo(
    () => entries.filter((entry) => selected.has(entry.id)),
    [entries, selected]
  );
  const captureCount = chosen.filter((row) => decidable(row, 'approve_capture')).length;
  const removeCount = chosen.filter((row) => decidable(row, 'remove')).length;

  const perEntry = async (call: (id: number) => Promise<unknown>): Promise<BulkOutcome> => {
    setBusy(true);
    const outcome: BulkOutcome = { done: 0, skipped: 0, failed: 0 };
    try {
      for (const entry of chosen.filter((row) => decidable(row, 'approve_capture'))) {
        try {
          await call(entry.id);
          outcome.done += 1;
        } catch {
          outcome.failed += 1;
        }
      }
    } finally {
      setBusy(false);
      clear();
      onDone();
    }
    return outcome;
  };

  const removeSelected = async (): Promise<BulkOutcome> => {
    setBusy(true);
    const ids = chosen
      .filter((row) => decidable(row, 'remove'))
      .map((row) => row.pendingDecision!.suggestionId);
    try {
      if (ids.length === 0) return { done: 0, skipped: 0, failed: 0 };
      const result = await kbQualityService.bulkReject(ids);
      // `expired` = decided elsewhere meanwhile; `forbidden` = not this person's to decide.
      return {
        done: result.rejected,
        skipped: result.expired + result.forbidden,
        failed: result.failed,
      };
    } finally {
      setBusy(false);
      clear();
      onDone();
    }
  };

  return {
    selected,
    toggle,
    clear,
    busy,
    selectableIds,
    captureCount,
    removeCount,
    approveSelected: () => perEntry((id) => kbService.approve(id)),
    rejectSelected: () => perEntry((id) => kbService.reject(id)),
    removeSelected,
  };
};
