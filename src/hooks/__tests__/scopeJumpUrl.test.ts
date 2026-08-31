/**
 * Caught on staging, not by a test — which is why this file exists.
 *
 * The scope notice's "10 outbound echoes" chip was wired as `setDisplayMode('threads')` +
 * `patchFilters({queue})`. Clicking it on the deployed board did nothing visible: the
 * kanban stayed, and the store's `queue` was back to `all` a beat later. Two partial
 * writes to the query string race the URL sync, and the `[searchParams]` reader resets the
 * store from whichever survived.
 *
 * The contract these pin is that the jump is ONE whole-query navigation with no `mode`,
 * which is what `LIST_ONLY_FILTER_PARAMS` in MessagesPage keys off to switch to the list.
 */
import { describe, it, expect } from 'vitest';
import { scopeJumpUrl } from '@/hooks/scopeJumpUrl';

describe('scopeJumpUrl', () => {
  it('carries the queue and omits mode, so the list view takes over', () => {
    // ⛔ `mode` must be ABSENT, not set to `threads`. MessagesPage switches to the list
    // when there is no `mode` AND a list-only filter param is present; writing a mode
    // here would satisfy the first branch of that effect instead and never reach it.
    const url = scopeJumpUrl({ queue: 'outbound_echo', lifecycle: 'all' });
    expect(url).toBe('/messages?queue=outbound_echo');
    expect(url).not.toContain('mode');
  });

  it('drops "all", which is the absence of a filter rather than a value', () => {
    expect(scopeJumpUrl({ queue: 'all', lifecycle: 'all' })).toBe('/messages');
  });

  it('keeps a real lifecycle alongside the queue', () => {
    const url = scopeJumpUrl({ queue: 'spam', lifecycle: 'resolved' });
    expect(url).toContain('queue=spam');
    expect(url).toContain('lifecycle=resolved');
  });

  it('ignores keys whose URL parameter is named differently', () => {
    // `columnId` is written to the URL as `column`. A generic loop over the patch would
    // emit `columnId=` — a parameter nothing reads — and the jump would look applied and
    // do nothing. Silence is the failure mode being excluded here.
    const url = scopeJumpUrl({ columnId: 'spam' } as Parameters<typeof scopeJumpUrl>[0]);
    expect(url).toBe('/messages');
    expect(url).not.toContain('columnId');
  });
});
