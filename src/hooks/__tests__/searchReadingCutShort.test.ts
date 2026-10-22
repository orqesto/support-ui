/**
 * The search reading (how the backend read the search, and whether a bound bit) belongs to the
 * rows on screen: restored WITH cached rows, and cleared when a different search is on its way.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messageService, type SearchReading } from '@/services/message.service';
import { useMessagesStore } from '@/stores/messagesStore';
import { useMessagesData } from '../useMessagesData';

vi.mock('../useDepartmentContextKey', () => ({ useDepartmentContextKey: () => '' }));

type Response = Awaited<ReturnType<typeof messageService.getThreads>>;
const answer = (search: SearchReading | null) =>
  ({
    success: true,
    data: [],
    pagination: { page: 1, limit: 50, total: 0, totalPages: 0, hasMore: false },
    scope: null,
    search,
  }) as unknown as Response;
const cutShort: SearchReading = { terms: ['nvoic'], asPhrase: false, cutShort: ['nvoic'] };

const setSearch = (search: string) =>
  act(() => {
    useMessagesStore.setState((state) => ({ filters: { ...state.filters, search } }));
  });

beforeEach(() => {
  useMessagesStore.getState().clearCache();
  useMessagesStore.setState((state) => ({ filters: { ...state.filters, search: 'nvoic' } }));
});
afterEach(() => {
  vi.restoreAllMocks();
  useMessagesStore.setState((state) => ({ filters: { ...state.filters, search: '' } }));
});

describe('search reading', () => {
  it('passes on the terms whose search inside words was cut short', async () => {
    vi.spyOn(messageService, 'getThreads').mockResolvedValue(answer(cutShort));
    const { result } = renderHook(() => useMessagesData({ urlSyncedRef: { current: true } }));
    await waitFor(() => expect(result.current.searchReading?.cutShort).toEqual(['nvoic']));
  });

  it('restores the reading with rows served from the cache — the warning comes back too', async () => {
    const calls = vi
      .spyOn(messageService, 'getThreads')
      .mockImplementation((filters) =>
        Promise.resolve(
          answer(
            filters?.search === 'nvoic'
              ? cutShort
              : { terms: ['invoice'], asPhrase: false, cutShort: [] }
          )
        )
      );
    const { result } = renderHook(() => useMessagesData({ urlSyncedRef: { current: true } }));
    await waitFor(() => expect(result.current.searchReading?.cutShort).toEqual(['nvoic']));
    setSearch('invoice');
    await waitFor(() => expect(result.current.searchReading?.terms).toEqual(['invoice']));
    const before = calls.mock.calls.length;
    setSearch('nvoic'); // back to a search already answered: from the cache
    await waitFor(() => expect(result.current.searchReading?.cutShort).toEqual(['nvoic']));
    expect(calls.mock.calls.length).toBe(before); // CONTROL: it really was the cache
  });

  it('clears the notice while a different search is on its way', async () => {
    vi.spyOn(messageService, 'getThreads').mockResolvedValueOnce(answer(cutShort));
    const { result } = renderHook(() => useMessagesData({ urlSyncedRef: { current: true } }));
    await waitFor(() => expect(result.current.searchReading?.cutShort).toEqual(['nvoic']));
    vi.spyOn(messageService, 'getThreads').mockImplementation(() => new Promise(() => undefined));
    setSearch('invoice');
    await waitFor(() => expect(result.current.searching).toBe(true));
    expect(result.current.searchReading).toBeNull();
  });
});
