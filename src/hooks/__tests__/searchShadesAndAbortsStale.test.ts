/**
 * A search reload shades the list (`searching`) and a newer search aborts the stale request.
 *
 * Before: after the first load a search only spun the small Refresh icon in the header while
 * the previous rows stayed on screen at full strength, reading as the answer. And a search
 * typed further waited for the previous, slower request to finish before it could start.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messageService } from '@/services/message.service';
import { useMessagesStore } from '@/stores/messagesStore';
import { useMessagesData } from '../useMessagesData';

vi.mock('../useDepartmentContextKey', () => ({ useDepartmentContextKey: () => '' }));

type Response = Awaited<ReturnType<typeof messageService.getThreads>>;
const empty = (): Response =>
  ({
    success: true,
    data: [],
    pagination: { page: 1, limit: 50, total: 0, totalPages: 0, hasMore: false },
    scope: null,
  }) as unknown as Response;

/** Each call parks until the test settles it; an abort rejects it, as axios does. */
const pending: { search?: string; signal?: AbortSignal; settle: () => void }[] = [];
const parkCalls = () =>
  vi.spyOn(messageService, 'getThreads').mockImplementation(
    (filters, _p, _l, _o, _s, options) =>
      new Promise<Response>((resolve, reject) => {
        options?.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('canceled'), { name: 'CanceledError' }))
        );
        pending.push({
          search: filters?.search,
          signal: options?.signal,
          settle: () => resolve(empty()),
        });
      })
  );

const setSearch = (search: string) =>
  act(() => {
    useMessagesStore.setState((state) => ({ filters: { ...state.filters, search } }));
  });

beforeEach(() => {
  pending.length = 0;
  useMessagesStore.getState().clearCache();
  useMessagesStore.setState((state) => ({ filters: { ...state.filters, search: '' } }));
});
afterEach(() => vi.restoreAllMocks());

const firstLoad = async () => {
  parkCalls();
  const hook = renderHook(() => useMessagesData({ urlSyncedRef: { current: true } }));
  await waitFor(() => expect(pending).toHaveLength(1));
  act(() => {
    pending[0].settle();
  });
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
};

describe('search reload', () => {
  it('shades the list while a different search is on its way, and unshades on arrival', async () => {
    const { result } = await firstLoad();
    expect(result.current.searching).toBe(false);

    setSearch('invoice');
    await waitFor(() => expect(pending).toHaveLength(2));
    expect(pending[1].search).toBe('invoice');
    expect(result.current.searching).toBe(true);

    act(() => {
      pending[1].settle();
    });
    await waitFor(() => expect(result.current.searching).toBe(false));
  });

  it('aborts the stale search when a newer one is typed, and runs the newer one', async () => {
    const { result } = await firstLoad();
    setSearch('inv');
    await waitFor(() => expect(pending).toHaveLength(2));

    setSearch('invoice march');
    // The stale request is aborted at once rather than waited out…
    await waitFor(() => expect(pending[1].signal?.aborted).toBe(true));
    // …and the newer one goes out straight after.
    await waitFor(() => expect(pending).toHaveLength(3));
    expect(pending[2].search).toBe('invoice march');
    expect(result.current.searching).toBe(true);

    act(() => {
      pending[2].settle();
    });
    await waitFor(() => expect(result.current.searching).toBe(false));
  });

  it('CONTROL: a refresh of the same search does not shade the rows it is refreshing', async () => {
    const { result } = await firstLoad();
    let refresh: Promise<void> | undefined;
    act(() => {
      refresh = result.current.handleRefresh();
    });
    await waitFor(() => expect(pending).toHaveLength(2));
    // The request is in flight (the control: something IS loading) but it answers the
    // search already on screen, so the rows are not stale.
    expect(result.current.refreshing).toBe(true);
    expect(result.current.searching).toBe(false);
    await act(async () => {
      pending[1].settle();
      await refresh;
    });
  });
});
