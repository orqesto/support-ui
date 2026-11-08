import { useCallback } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import type { FilterState } from '../stores/messagesStore';
import { scopeJumpUrl } from './scopeJumpUrl';

export const useScopeJump = (
  navigate: NavigateFunction,
  patchFilters: (patch: Partial<FilterState>) => void
) => {
  /**
   * Jump to the lens holding a category the current surface hides. Shared by both scope
   * notices so the list and the board cannot drift on what a chip does.
   *
   * `needsListView` is set for categories NO kanban column can display. Setting the filter
   * without leaving the board would apply it and change nothing visible — a link that
   * appears broken, which is worse than a plain number. Today that is `outbound_echo`.
   */
  const handleScopeJump = useCallback(
    (next: Partial<FilterState>, needsListView?: boolean) => {
      if (needsListView) {
        /**
         * ⛔ NOT `setDisplayMode('threads')` + `patchFilters(...)`. That was the first
         * attempt and it silently undid itself on staging: the two produce two PARTIAL,
         * competing writes to the query string — the mode effect deletes `mode` with a
         * functional update, while the filters effect rebuilds the params from scratch
         * and carries `mode` over from a ref. Whichever lands second wins, and the
         * `[searchParams]` reader then resets the store from whatever survived. Observed
         * result: the board stayed, and `queue` went back to `all`.
         *
         * ONE whole-query navigation instead — the same thing the Notification Center
         * does for `?queue=spam`, and the case the mode effect's own comment describes:
         * no `mode` + a list-only filter param means "switch to the list and show it".
         */
        navigate(scopeJumpUrl(next));
        return;
      }
      // patchFilters merges, so pass only the delta. The store clears the cache AND the
      // stale scope on a filter change — the old count describes the old lens, and
      // leaving it up is a smaller version of the same lie.
      patchFilters(next as FilterState);
    },
    [navigate, patchFilters]
  );
  return handleScopeJump;
};
