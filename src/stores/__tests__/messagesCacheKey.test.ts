/**
 * The list cache must not answer a question the board asked.
 *
 * `useMessagesData` deliberately sends a DIFFERENT request on the kanban than the filters
 * describe: it zeroes `lifecycle`, `queue`, `read` and `columnId`, because each column
 * hard-sets its own and the shared query only feeds the header count. The cache key was
 * built from the filters alone, so that response was stored under the UNMODIFIED filters —
 * and the list view read it straight back.
 *
 * Seen on staging: the scope notice's "10 outbound echoes" chip navigated correctly, the
 * `Outbound Echo` token rendered, and the list showed 16 unrelated threads. The API was
 * right at every step (`queue=outbound_echo` → 10, from the same endpoint the app calls).
 * There was no second request to inspect, which is what made it look like a server
 * disagreement: the network was silent because the cache had answered.
 *
 * ⚠️ These assert the KEY, not the store's behaviour end to end. The invariant is narrow
 * and worth stating precisely: two requests that differ must not share an entry.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useMessagesStore, defaultFilters } from '@/stores/messagesStore';
import type { MessageThread } from '@/services/message.service';

vi.mock('@/stores/departmentContextStore', () => ({
  useDepartmentContextStore: { getState: () => ({ getSelectedDeptIds: () => [] }) },
}));

const pagination = { page: 1, limit: 50, total: 16, totalPages: 1, hasMore: false };
const rows = [{ threadId: 'conv_1' } as unknown as MessageThread];

describe('messages cache key', () => {
  beforeEach(() => {
    useMessagesStore.setState({ cache: {}, filters: { ...defaultFilters, queue: 'outbound_echo' } });
  });

  it('does not serve a board response to the list view', () => {
    const { setMessages, getCached } = useMessagesStore.getState();

    // The board stores its result while the filters already say `queue=outbound_echo` —
    // the request that produced it had the queue stripped.
    setMessages(rows, pagination, null, true);

    // The list asks the same page with the same filters. It must MISS.
    expect(useMessagesStore.getState().getCached(1, false)).toBeNull();
    // Control: the board itself still hits, so the miss above is about the surface and
    // not a cache that simply never stores anything.
    expect(getCached(1, true)).not.toBeNull();
  });

  it('still caches within one surface', () => {
    useMessagesStore.getState().setMessages(rows, pagination, null, false);
    expect(useMessagesStore.getState().getCached(1, false)?.pagination.total).toBe(16);
  });
});
