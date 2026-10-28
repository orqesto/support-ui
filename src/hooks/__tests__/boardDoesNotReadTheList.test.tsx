/**
 * The board reads its own lanes; the thread list under it is not read (staging, 2026-10-28: 10
 * searches per Threads click on the board, one of them this 50-row list nothing on the board drew).
 * Switching back to the list must read it at once — `isKanban` is a dependency of the fetch effect.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getThreads = vi.fn(() =>
  Promise.resolve({
    threads: [],
    pagination: { page: 1, limit: 50, total: 0, totalPages: 0, hasMore: false },
    scope: null,
  })
);
vi.mock('@/services/message.service', () => ({ messageService: { getThreads } }));

const { useMessagesData } = await import('../useMessagesData');
const { useMessagesStore } = await import('@/stores/messagesStore');

const urlSyncedRef = { current: true };

describe('the board does not read the thread list', () => {
  beforeEach(() => {
    getThreads.mockClear();
    useMessagesStore.getState().clearCache();
  });

  it('on the board: no list request, and loading settles so the counts can run', async () => {
    const { result } = renderHook(() => useMessagesData({ urlSyncedRef, isKanban: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(getThreads).not.toHaveBeenCalled();
  });

  it('a forced refetch on the board (a server event) reads nothing either', async () => {
    const { result } = renderHook(() => useMessagesData({ urlSyncedRef, isKanban: true }));
    await result.current.fetchMessages(1, true);
    expect(getThreads).not.toHaveBeenCalled();
  });

  it('CONTROL — the list reads, and board → list reads at once', async () => {
    const { rerender } = renderHook(({ isKanban }) => useMessagesData({ urlSyncedRef, isKanban }), {
      initialProps: { isKanban: true },
    });
    expect(getThreads).not.toHaveBeenCalled();
    rerender({ isKanban: false });
    await waitFor(() => expect(getThreads).toHaveBeenCalledTimes(1));
  });
});
