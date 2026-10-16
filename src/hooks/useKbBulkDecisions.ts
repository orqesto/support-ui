import { useCallback, useEffect, useMemo, useState } from 'react';
import { kbService, type KBEntry } from '@/services/kb.service';
import { kbQualityService } from '@/services/kbQuality.service';

export type BulkOutcome = { done: number; skipped: number; failed: number };

const BULK_KINDS = ['approve_capture', 'remove'];

const decidable = (entry: KBEntry, kind: string) =>
  entry.pendingDecision?.kind === kind && entry.pendingDecision.canDecide;

/** A row the person can decide AND a bulk action covers — the only rows given a checkbox. */
export const isBulkSelectable = (entry: KBEntry, kind?: string) =>
  Boolean(
    entry.pendingDecision?.canDecide &&
      (kind ? entry.pendingDecision.kind === kind : BULK_KINDS.includes(entry.pendingDecision.kind))
  );

type BulkMode = 'needs_decision' | 'suggested_change' | null;

/** The one decision kind each filter's bar offers. */
const kindFor = (mode: BulkMode) => (mode === 'suggested_change' ? 'remove' : 'approve_capture');

export const useKbBulkDecisions = (
  entries: KBEntry[],
  /** `left`: how many decided rows left the decision filter's list (failed ones stay). */
  onDone: (left: number) => void,
  mode: BulkMode = null
) => {
  const kind = mode ? kindFor(mode) : undefined;
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

  const selectable = useCallback((entry: KBEntry) => isBulkSelectable(entry, kind), [kind]);
  const selectableIds = useMemo(
    () => entries.filter(selectable).map((entry) => entry.id),
    [entries, selectable]
  );
  // A different filter or page shows different rows: drop ticks that no longer apply.
  const shownIds = entries.map((entry) => entry.id).join(',');
  useEffect(() => setSelected(new Set()), [shownIds, mode]);
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
      onDone(outcome.done);
    }
    return outcome;
  };

  const removeSelected = async (): Promise<BulkOutcome> => {
    setBusy(true);
    let left = 0;
    const ids = chosen
      .filter((row) => decidable(row, 'remove'))
      .map((row) => row.pendingDecision!.suggestionId);
    try {
      if (ids.length === 0) return { done: 0, skipped: 0, failed: 0 };
      const result = await kbQualityService.bulkReject(ids);
      left = result.rejected + result.expired;
      // `expired` = decided elsewhere meanwhile; `forbidden` = not this person's to decide.
      return {
        done: result.rejected,
        skipped: result.expired + result.forbidden,
        failed: result.failed,
      };
    } finally {
      setBusy(false);
      clear();
      onDone(left);
    }
  };

  return {
    selected,
    toggle,
    clear,
    busy,
    selectableIds,
    selectable,
    captureCount,
    removeCount,
    approveSelected: () => perEntry((id) => kbService.approve(id)),
    rejectSelected: () => perEntry((id) => kbService.reject(id)),
    removeSelected,
  };
};
