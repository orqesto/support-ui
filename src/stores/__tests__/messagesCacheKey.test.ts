/**
 * A cached list must be labelled with the question it answered.
 *
 * Two faults met here, and together they made the scope notice's "10 outbound echoes" chip
 * land on 16 unrelated threads with NOTHING on the wire to explain it:
 *
 *  1. `setMessages` derived the key from `get().filters` — the store's state at RESPONSE
 *     time, not the state the request was BUILT from. On the board the request builder
 *     deliberately strips `queue`, so its 16 rows were filed under a key that named the
 *     queue the request never asked about.
 *  2. `isKanban` was not part of the key at all, so the board and the list shared entries
 *     even when they had asked different questions.
 *
 * The key is now computed by the CALLER from the snapshot it built the request with, and
 * passed in. `getCached`/`setMessages` no longer read the store to decide identity, which
 * is what makes an entry impossible to mislabel.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useMessagesStore, messagesCacheKey, defaultFilters } from '@/stores/messagesStore';
import type { MessageThread } from '@/services/message.service';

vi.mock('@/stores/departmentContextStore', () => ({
  useDepartmentContextStore: { getState: () => ({ getSelectedDeptIds: () => [] }) },
}));

const sorting = { sortBy: 'time', sortOrder: 'desc' } as const;
const pagination = { page: 1, limit: 50, total: 16, totalPages: 1, hasMore: false };
const rows = [{ threadId: 'conv_1' } as unknown as MessageThread];

/** What the BOARD actually asks: the queue is stripped by the request builder. */
const boardAsked = { ...defaultFilters, queue: 'all' as const };
/** What the LIST asks after the jump. */
const listAsked = { ...defaultFilters, queue: 'outbound_echo' as const };

describe('messages cache identity', () => {
  beforeEach(() => useMessagesStore.setState({ cache: {} }));

  it('separates the board from the list even when the filters match', () => {
    expect(messagesCacheKey(listAsked, sorting, 1, true)).not.toBe(
      messagesCacheKey(listAsked, sorting, 1, false)
    );
  });

  it('files a response under what the REQUEST asked, not what the store says now', () => {
    // The board's request goes out while `queue` is still 'all'…
    const key = messagesCacheKey(boardAsked, sorting, 1, true);
    // …and by the time it lands the user has jumped, so the store now says otherwise.
    useMessagesStore.setState({ filters: listAsked });
    useMessagesStore.getState().setMessages(rows, pagination, null, key);

    // The list must not be handed those rows.
    const listKey = messagesCacheKey(listAsked, sorting, 1, false);
    expect(useMessagesStore.getState().getCached(listKey)).toBeNull();
    // Control: the entry does exist under the key that describes it, so the miss above
    // is about labelling and not about a cache that stores nothing.
    expect(useMessagesStore.getState().getCached(key)?.pagination.total).toBe(16);
  });

  it('still hits when the same question is asked twice', () => {
    const key = messagesCacheKey(listAsked, sorting, 1, false);
    useMessagesStore.getState().setMessages(rows, pagination, null, key);
    expect(useMessagesStore.getState().getCached(key)?.pagination.total).toBe(16);
  });
});
