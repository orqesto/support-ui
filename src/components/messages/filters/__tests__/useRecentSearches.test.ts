/**
 * useRecentSearches: the list updates the moment a search settles (a repeat moves to the top,
 * however it was cased), and a backend without the route leaves the list empty and silent.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { recentSearchService } from '@/services/recentSearch.service';
import { useRecentSearches } from '../useRecentSearches';

afterEach(() => vi.restoreAllMocks());

const row = (id: number, query: string) => ({ id, query, lastUsedAt: '2026-10-22T08:00:00Z' });

describe('useRecentSearches', () => {
  it('loads, then moves a repeated search to the top without duplicating it', async () => {
    vi.spyOn(recentSearchService, 'list').mockResolvedValue([
      row(2, 'refund'),
      row(1, 'John Smith'),
    ]);
    const recordCall = vi
      .spyOn(recentSearchService, 'record')
      .mockImplementation((query) => Promise.resolve(row(1, query)));
    const { result } = renderHook(() => useRecentSearches());
    await waitFor(() => expect(result.current.recent).toHaveLength(2));

    act(() => result.current.record('john  smith'));
    expect(result.current.recent.map((entry) => entry.query)).toEqual(['john smith', 'refund']);
    expect(recordCall).toHaveBeenCalledWith('john smith');
  });

  it('on a backend without the route: empty, and nothing more is sent', async () => {
    vi.spyOn(recentSearchService, 'list').mockRejectedValue({ response: { status: 404 } });
    const recordCall = vi.spyOn(recentSearchService, 'record').mockResolvedValue(row(1, 'x'));
    const { result } = renderHook(() => useRecentSearches());
    await waitFor(() => expect(recentSearchService.list).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    act(() => result.current.record('invoice'));
    expect(result.current.recent).toEqual([]);
    expect(recordCall).not.toHaveBeenCalled();
  });
});
