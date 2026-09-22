/**
 * What is selected, and what the server says can be done with it.
 *
 * Two rules the board forced:
 *  - a selection SURVIVES a refresh (marking one thread read refreshes the board; the other 14
 *    must stay picked), and
 *  - a selection is CLEARED when the scope changes (a filter or department switch shows
 *    different threads, so the ids from before are about rows the agent can no longer see).
 *
 * The per-action counts come from the server's preview, never from a rule here — see
 * `bulkActions.ts`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { bulkService } from '@/services/bulk.service';
import { logger } from '@/lib/logger';
import { BULK_ACTIONS, type BulkAction, type BulkPreview } from './bulkActions';

/** Long enough to swallow a run of clicks, short enough that the bar feels immediate. */
const PREVIEW_DEBOUNCE_MS = 250;

export type BulkSelection = {
  selectedIds: number[];
  isSelected: (id: number) => boolean;
  toggle: (id: number) => void;
  clear: () => void;
  selectMany: (ids: number[]) => void;
  deselectMany: (ids: number[]) => void;
  /** Preview per action, or null while it is being fetched. */
  previews: Partial<Record<BulkAction, BulkPreview>>;
  loading: boolean;
};

/**
 * @param scopeKey anything that changes when the visible set of threads changes (filters,
 * department, tab). A change clears the selection.
 */
export const useBulkSelection = (scopeKey: string): BulkSelection => {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [previews, setPreviews] = useState<Partial<Record<BulkAction, BulkPreview>>>({});
  const [loading, setLoading] = useState(false);

  // A scope change makes the current ids meaningless — they name rows that are no longer on
  // screen. Skipped on the first render so mounting does not clear a selection restored elsewhere.
  const previousScope = useRef(scopeKey);
  useEffect(() => {
    if (previousScope.current === scopeKey) return;
    previousScope.current = scopeKey;
    setSelectedIds([]);
    setPreviews({});
  }, [scopeKey]);

  const selectedKey = useMemo(() => selectedIds.join(','), [selectedIds]);

  // One preview request per action, so the bar can say "12 of 15" per action and hide the ones
  // that fit nothing. They run together; a slow one does not hold up the others.
  useEffect(() => {
    if (selectedIds.length === 0) {
      setPreviews({});
      return;
    }
    let cancelled = false;
    setLoading(true);
    const ids = [...selectedIds];

    // ⛔ Debounced. Ticking five boxes is five renders, and each one would otherwise fire SEVEN
    // preview requests — 35 requests for one gesture, all but the last answering a selection
    // that no longer exists. One round per pause instead.
    const timer = setTimeout(() => {
      void Promise.all(
        BULK_ACTIONS.map(async (action) => {
          try {
            const response = await bulkService.preview(action, ids);
            return response.success ? ([action, response.data] as const) : null;
          } catch (err) {
            // A 403 is the ordinary answer for an action this agent may not run: the bar simply
            // does not offer it. Anything else is logged and treated the same way — an action we
            // cannot describe is one we must not offer.
            logger.debug(`[bulk] preview failed for ${action}`, err);
            return null;
          }
        })
      ).then((entries) => {
        if (cancelled) return;
        const next: Partial<Record<BulkAction, BulkPreview>> = {};
        for (const entry of entries) {
          if (entry) next[entry[0]] = entry[1];
        }
        setPreviews(next);
        setLoading(false);
      });
    }, PREVIEW_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      setLoading(false);
    };
    // selectedKey is a stable string proxy for selectedIds' contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  const toggle = useCallback((id: number) => {
    setSelectedIds((previous) =>
      previous.includes(id) ? previous.filter((entry) => entry !== id) : [...previous, id]
    );
  }, []);

  const selectMany = useCallback((ids: number[]) => {
    setSelectedIds((previous) => [...new Set([...previous, ...ids])]);
  }, []);

  const deselectMany = useCallback((ids: number[]) => {
    const drop = new Set(ids);
    setSelectedIds((previous) => previous.filter((entry) => !drop.has(entry)));
  }, []);

  const clear = useCallback(() => {
    setSelectedIds([]);
    setPreviews({});
  }, []);

  const isSelected = useCallback((id: number) => selectedIds.includes(id), [selectedIds]);

  return { selectedIds, isSelected, toggle, clear, selectMany, deselectMany, previews, loading };
};
