import type { FilterState } from '@/stores/messagesStore';

/**
 * The URL that lands the list view on a category the current surface cannot show.
 *
 * ⛔ Why this is a URL and not two `setState` calls. The first version of the scope-notice
 * jump did `setDisplayMode('threads')` + `patchFilters(...)`, and on staging it silently
 * undid itself: the board stayed and `queue` went back to `all`. Those are two PARTIAL,
 * competing writes to the query string — the mode effect deletes `mode` via a functional
 * update while the filters effect rebuilds the params from scratch and carries `mode` over
 * from a ref — so whichever lands second wins, and the `[searchParams]` reader then resets
 * the store from whatever survived.
 *
 * ONE whole-query navigation has no such race, and it is the path the app already
 * documents: no `mode` plus a list-only filter param (`LIST_ONLY_FILTER_PARAMS`) means
 * "switch to the list and show this". The Notification Center's `?queue=spam` is the same
 * move.
 *
 * ⚠️ Keys are named EXPLICITLY. A generic loop over the patch would mis-map any
 * `FilterState` key whose URL parameter has a different name — `columnId` is written as
 * `column` — and it would do it silently. Extend this when a new jump needs a new key.
 */
export const scopeJumpUrl = (next: Partial<FilterState>): string => {
  const params = new URLSearchParams();
  if (next.queue && next.queue !== 'all') params.set('queue', next.queue);
  if (next.lifecycle && next.lifecycle !== 'all') params.set('lifecycle', next.lifecycle);
  const query = params.toString();
  return query ? `/messages?${query}` : '/messages';
};
