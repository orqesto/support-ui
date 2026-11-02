/**
 * The thread list asks for its scope count (`scope=1`, an aggregate over the whole workspace)
 * only when the QUESTION changes — the filters, department or workspace — or when no count is on
 * screen. It was asked on every read: on a 130,000-thread workspace that took 9.8–13.8 s cold
 * (staging, 2026-10-29), and the list refreshes every few seconds per open tab.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const SCOPE = { hidden: 3, hiddenBecause: { terminal: 3, orphanOutgoing: 0 } };
let scopeAnswer: typeof SCOPE | null = SCOPE;

const getThreads = vi.fn((filters?: Record<string, string>, page?: number) =>
  Promise.resolve({
    success: true,
    data: [] as unknown[],
    pagination: { page: page ?? 1, limit: 50, total: 120, totalPages: 3 },
    // The backend answers `scope: null` when it was not asked.
    scope: filters?.scope === '1' ? scopeAnswer : null,
    search: null,
  })
);
vi.mock('@/services/message.service', () => ({ messageService: { getThreads } }));

const { useMessagesData, SCOPE_UNKNOWN_RETRY_MS } = await import('../useMessagesData');
const { useMessagesStore } = await import('@/stores/messagesStore');

const urlSyncedRef = { current: true };
const askedScope = () => getThreads.mock.calls.map(([filters]) => filters?.scope === '1');

describe('the list asks for its scope count only when the lens changes', () => {
  beforeEach(() => {
    getThreads.mockClear();
    scopeAnswer = SCOPE;
    useMessagesStore.getState().clearCache();
    useMessagesStore.getState().setListScope(null);
  });

  it('a refresh and another page keep the count they have, without asking again', async () => {
    const { result } = renderHook(() => useMessagesData({ urlSyncedRef, isKanban: false }));
    await waitFor(() => expect(getThreads).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(useMessagesStore.getState().listScope).toEqual(SCOPE));

    await act(() => result.current.fetchMessages(1, true));
    await act(() => result.current.fetchMessages(2, true));

    // CONTROL: the first read asked.
    expect(askedScope()).toEqual([true, false, false]);
    // The count on screen still describes this lens.
    expect(useMessagesStore.getState().listScope).toEqual(SCOPE);
  });

  it('a filter change asks again', async () => {
    const { result } = renderHook(() => useMessagesData({ urlSyncedRef, isKanban: false }));
    await waitFor(() => expect(getThreads).toHaveBeenCalledTimes(1));
    act(() => useMessagesStore.getState().setFilters({ priority: 'high' }));
    await waitFor(() => expect(getThreads).toHaveBeenCalledTimes(2));
    await act(() => result.current.fetchMessages(1, true));
    expect(askedScope()).toEqual([true, true, false]);
  });

  // Review of #1300: `scope: null` is the backend's count running past its budget. Asked again on
  // every read, a slow searched term paid the whole budget and a heavy slot each time for another
  // null. It is asked again once SCOPE_UNKNOWN_RETRY_MS has passed.
  it('a count that came back unknown is not asked again at once — only after the retry window', async () => {
    scopeAnswer = null;
    let now = 1_000_000;
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      const { result } = renderHook(() => useMessagesData({ urlSyncedRef, isKanban: false }));
      await waitFor(() => expect(getThreads).toHaveBeenCalledTimes(1));
      scopeAnswer = SCOPE;
      await act(() => result.current.fetchMessages(1, true));
      expect(askedScope()).toEqual([true, false]);
      now += SCOPE_UNKNOWN_RETRY_MS + 1;
      await act(() => result.current.fetchMessages(1, true));
      await act(() => result.current.fetchMessages(1, true));
      expect(askedScope()).toEqual([true, false, true, false]);
      expect(useMessagesStore.getState().listScope).toEqual(SCOPE);
    } finally {
      clock.mockRestore();
    }
  });

  // Review of #803 (probed): lens A unknown → lens B counted → back to A inside the window showed
  // B's numbers on A. Not asked, the count is kept only if it was answered for this lens.
  it('back on a lens inside its "unknown" window shows no count — never another lens\'s', async () => {
    const { result } = renderHook(() => useMessagesData({ urlSyncedRef, isKanban: false }));
    await waitFor(() => expect(getThreads).toHaveBeenCalledTimes(1));
    // Lens A answers "unknown".
    scopeAnswer = null;
    act(() => useMessagesStore.getState().setFilters({ priority: 'critical' }));
    await waitFor(() => expect(getThreads).toHaveBeenCalledTimes(2));
    // Lens B is counted.
    scopeAnswer = SCOPE;
    act(() => useMessagesStore.getState().setFilters({ priority: 'medium' }));
    await waitFor(() => expect(useMessagesStore.getState().listScope).toEqual(SCOPE));
    // Back to A the way updateFilter does it: the filters change, B's count stays in the store.
    void act(() =>
      useMessagesStore.setState((state) => ({ filters: { ...state.filters, priority: 'critical' } }))
    );
    await act(() => result.current.fetchMessages(1, true));
    expect(useMessagesStore.getState().listScope).toBeNull();
  });
});
