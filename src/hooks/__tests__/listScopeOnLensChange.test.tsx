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

const { useMessagesData } = await import('../useMessagesData');
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

  it('a count that did not come back is asked for again on the next read', async () => {
    scopeAnswer = null;
    const { result } = renderHook(() => useMessagesData({ urlSyncedRef, isKanban: false }));
    await waitFor(() => expect(getThreads).toHaveBeenCalledTimes(1));
    scopeAnswer = SCOPE;
    await act(() => result.current.fetchMessages(1, true));
    await act(() => result.current.fetchMessages(1, true));
    expect(askedScope()).toEqual([true, true, false]);
    expect(useMessagesStore.getState().listScope).toEqual(SCOPE);
  });
});
