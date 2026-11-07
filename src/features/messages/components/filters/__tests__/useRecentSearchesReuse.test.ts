/**
 * Opening the threads screen again within 30 s reuses the recent-search list instead of re-reading
 * it (staging, 2026-11-06: every Dashboard ↔ Threads round trip re-sent it). A write forgets the
 * held list, so the next mount reads the server again.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { recentSearchService } from '@/services/recentSearch.service';
import { useRecentSearches } from '../useRecentSearches';

afterEach(() => vi.restoreAllMocks());

const row = (id: number, query: string) => ({ id, query, lastUsedAt: '2026-10-22T08:00:00Z' });

describe('useRecentSearches reuse', () => {
  it('a remount within the window reuses the list', async () => {
    const list = vi.spyOn(recentSearchService, 'list').mockResolvedValue([row(1, 'refund')]);
    const first = renderHook(() => useRecentSearches());
    await waitFor(() => expect(first.result.current.recent).toHaveLength(1));
    first.unmount();

    const second = renderHook(() => useRecentSearches());
    await waitFor(() => expect(second.result.current.recent).toHaveLength(1));
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('CONTROL: after a search is recorded, the next mount reads the server again', async () => {
    const list = vi.spyOn(recentSearchService, 'list').mockResolvedValue([row(1, 'refund')]);
    vi.spyOn(recentSearchService, 'record').mockImplementation((query) =>
      Promise.resolve(row(2, query))
    );
    const first = renderHook(() => useRecentSearches());
    await waitFor(() => expect(first.result.current.recent).toHaveLength(1));
    await act(async () => {
      first.result.current.record('invoice');
      await Promise.resolve();
    });
    first.unmount();

    list.mockResolvedValue([row(2, 'invoice'), row(1, 'refund')]);
    const second = renderHook(() => useRecentSearches());
    await waitFor(() => expect(second.result.current.recent).toHaveLength(2));
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('CONTROL: after a clear, the next mount reads the server again', async () => {
    const list = vi.spyOn(recentSearchService, 'list').mockResolvedValue([row(1, 'refund')]);
    vi.spyOn(recentSearchService, 'clear').mockResolvedValue(undefined);
    const first = renderHook(() => useRecentSearches());
    await waitFor(() => expect(first.result.current.recent).toHaveLength(1));
    act(() => first.result.current.clear());
    first.unmount();

    list.mockResolvedValue([]);
    const second = renderHook(() => useRecentSearches());
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(second.result.current.recent).toEqual([]);
  });
});
