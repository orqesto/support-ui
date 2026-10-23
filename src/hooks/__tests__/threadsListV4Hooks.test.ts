import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultFilters, type FilterState, type SortingState } from '@/stores/messagesStore';

const getThreads = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/services/message.service', () => ({
  messageService: { getThreads: (...args: unknown[]) => getThreads(...args) },
}));
const loggerError = vi.fn<(...args: unknown[]) => void>();
vi.mock('@/lib/logger', () => ({
  logger: {
    error: (...args: unknown[]) => loggerError(...args),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));
vi.mock('../useDepartmentContextKey', () => ({ useDepartmentContextKey: () => 'all' }));

const { useThreadViewCounts } = await import('../useThreadViewCounts');
const { useNewThreadsBar, PROBE_RETRY_MS } = await import('../useNewThreadsBar');
const { threadApiFilters } = await import('../threadApiFilters');

const filters = (over: Partial<FilterState> = {}): FilterState => ({ ...defaultFilters, ...over });
const sorting: SortingState = { sortBy: 'time', sortOrder: 'desc' };

beforeEach(() => getThreads.mockReset());

describe('useThreadViewCounts — a pill counts the list it opens', () => {
  it('asks with the list request itself at limit 1, and reads its total', async () => {
    getThreads.mockImplementation((...args: unknown[]) => {
      const params = args[0] as Record<string, string> | undefined;
      return Promise.resolve({
        success: true,
        data: [],
        // Mine adds the assignee parameter(s) to Needs us's one.
        pagination: { total: Object.keys(params ?? {}).length > 1 ? 4 : 12 },
      });
    });
    const requests = [
      { key: 'needs_us', filters: filters({ lifecycle: 'needs_us' }) },
      { key: 'Mine', filters: filters({ lifecycle: 'needs_us', assigneeId: 'me' }) },
    ];
    const { result } = renderHook(() => useThreadViewCounts(requests, 0));
    await waitFor(() => expect(result.current).toEqual({ needs_us: 12, Mine: 4 }));
    // The exact parameters the list would send for those filters — never a separate count query.
    expect(getThreads).toHaveBeenCalledWith(threadApiFilters(requests[0].filters, false), 1, 1);
    expect(getThreads).toHaveBeenCalledWith(threadApiFilters(requests[1].filters, false), 1, 1);
  });

  it('a count the server could not give is unknown, not zero', async () => {
    getThreads.mockResolvedValue({ success: false, data: [], pagination: { total: 0 } });
    const { result } = renderHook(() => useThreadViewCounts([{ key: 'x', filters: filters() }], 0));
    await waitFor(() => expect(getThreads).toHaveBeenCalled());
    await waitFor(() => expect('x' in result.current).toBe(true));
    expect(result.current.x).toBeUndefined();
  });
});

describe('useNewThreadsBar — arrivals wait instead of moving the rows', () => {
  const page = (ids: string[]) => ({
    success: true,
    data: ids.map((threadId) => ({ threadId })),
    pagination: { total: ids.length },
  });

  it('counts only threads on page 1 that are not on screen, and forgets them once shown', async () => {
    getThreads.mockResolvedValue(page(['new-1', 'a', 'new-2', 'b']));
    const { result, rerender } = renderHook(
      (props: { shown: string[] }) =>
        useNewThreadsBar({
          filters: filters({ lifecycle: 'needs_us' }),
          sorting,
          shownIds: props.shown,
        }),
      {
        initialProps: { shown: ['a', 'b'] },
      }
    );
    act(() => result.current.probe());
    await waitFor(() => expect(result.current.count).toBe(2));
    // The list's own request, first page.
    expect(getThreads).toHaveBeenCalledWith(
      threadApiFilters(filters({ lifecycle: 'needs_us' }), false),
      1,
      50,
      'desc',
      'time'
    );
    // Another re-read drew one of them: it no longer waits.
    rerender({ shown: ['new-1', 'a', 'b'] });
    await waitFor(() => expect(result.current.count).toBe(1));
    act(() => result.current.reset());
    expect(result.current.count).toBe(0);
  });

  it('control: nothing new on page 1 ⇒ no bar', async () => {
    getThreads.mockResolvedValue(page(['a', 'b']));
    const { result } = renderHook(() =>
      useNewThreadsBar({ filters: filters(), sorting, shownIds: ['a', 'b'] })
    );
    act(() => result.current.probe());
    await waitFor(() => expect(getThreads).toHaveBeenCalled());
    expect(result.current.count).toBe(0);
  });

  it('a failed check is asked again, so one bad moment cannot hide new mail', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      getThreads
        .mockRejectedValueOnce(new Error('A server error occurred.'))
        .mockResolvedValueOnce(page(['new-1', 'a']));
      const { result } = renderHook(() =>
        useNewThreadsBar({ filters: filters(), sorting, shownIds: ['a'] })
      );
      act(() => result.current.probe());
      await waitFor(() => expect(getThreads).toHaveBeenCalledTimes(1));
      expect(result.current.count).toBe(0);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(PROBE_RETRY_MS);
      });
      await waitFor(() => expect(result.current.count).toBe(1));
      expect(getThreads).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives up after two retries and says so once', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    loggerError.mockReset();
    try {
      getThreads
        .mockRejectedValueOnce(new Error('down'))
        .mockRejectedValueOnce(new Error('down'))
        .mockRejectedValueOnce(new Error('down'));
      const { result } = renderHook(() =>
        useNewThreadsBar({ filters: filters(), sorting, shownIds: [] })
      );
      act(() => result.current.probe());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(PROBE_RETRY_MS * 5);
      });
      expect(getThreads).toHaveBeenCalledTimes(3);
      expect(loggerError).toHaveBeenCalledTimes(1);
      expect(result.current.count).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
