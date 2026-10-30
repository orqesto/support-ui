import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultFilters, type FilterState, type SortingState } from '@/stores/messagesStore';

const getThreads = vi.fn<(...args: unknown[]) => Promise<unknown>>();
// `null` = a backend without the board route: the pills then count one list request each.
const getThreadBoard = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/services/message.service', () => ({
  messageService: {
    getThreads: (...args: unknown[]) => getThreads(...args),
    getThreadBoard: (...args: unknown[]) => getThreadBoard(...args),
  },
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

beforeEach(() => {
  getThreads.mockReset();
  getThreadBoard.mockReset();
  getThreadBoard.mockResolvedValue(null);
});

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

  it('does not re-ask while the refresh key is unchanged — a re-read of the same rows', async () => {
    getThreads.mockResolvedValue({ success: true, data: [], pagination: { total: 3 } });
    const requests = [{ key: 'x', filters: filters() }];
    const { rerender } = renderHook(
      (props: { at: string }) => useThreadViewCounts(requests, props.at),
      {
        initialProps: { at: 'rows-a' },
      }
    );
    await waitFor(() => expect(getThreads).toHaveBeenCalledTimes(1));
    rerender({ at: 'rows-a' });
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(getThreads).toHaveBeenCalledTimes(1);
    rerender({ at: 'rows-b' });
    await waitFor(() => expect(getThreads).toHaveBeenCalledTimes(2));
  });

  it('held while disabled (the list is being read), then ONE round', async () => {
    getThreads.mockResolvedValue({ success: true, data: [], pagination: { total: 3 } });
    const requests = [
      { key: 'a', filters: filters() },
      { key: 'b', filters: filters({ assigneeId: 'me' }) },
    ];
    const { rerender, result } = renderHook(
      (props: { at: string; on: boolean }) => useThreadViewCounts(requests, props.at, props.on),
      { initialProps: { at: 'empty', on: false } }
    );
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(getThreads).not.toHaveBeenCalled();
    // The list landed: new rows AND enabled in the same render.
    rerender({ at: 'rows', on: true });
    await waitFor(() => expect(result.current).toEqual({ a: 3, b: 3 }));
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(getThreads).toHaveBeenCalledTimes(2);
  });

  it('a count the server could not give is unknown, not zero', async () => {
    getThreads.mockResolvedValue({ success: false, data: [], pagination: { total: 0 } });
    const { result } = renderHook(() => useThreadViewCounts([{ key: 'x', filters: filters() }], 0));
    await waitFor(() => expect(getThreads).toHaveBeenCalled());
    await waitFor(() => expect('x' in result.current).toBe(true));
    expect(result.current.x).toBeUndefined();
  });

  it('a search counted to the cap is "at least"; one cut short by the time limit is unknown', async () => {
    // The two counts are asked in request order.
    getThreads
      .mockResolvedValueOnce({
        success: true,
        data: [],
        pagination: { total: 10000, totalCapped: true, countTimedOut: false },
      })
      .mockResolvedValueOnce({
        success: true,
        data: [],
        pagination: { total: 26, totalCapped: true, countTimedOut: true },
      });
    const { result } = renderHook(() =>
      useThreadViewCounts(
        [
          { key: 'capped', filters: filters() },
          { key: 'cut', filters: filters({ assigneeId: 'me' }) },
        ],
        0
      )
    );
    await waitFor(() => expect('cut' in result.current).toBe(true));
    expect(result.current.capped).toEqual({ atLeast: 10000 });
    expect(result.current.cut).toBeUndefined();
  });
});

describe('useThreadViewCounts — every pill in one board request', () => {
  type BoardRequest = { counts: Array<{ id: string; filters: Record<string, string> }> };
  const answering = (totals: number[]) => (request: unknown) => {
    const { counts } = request as BoardRequest;
    return Promise.resolve({
      columns: {},
      counts: Object.fromEntries(
        counts.map((count, idx) => [count.id, { pagination: { total: totals[idx] }, scope: null }])
      ),
    });
  };

  it("asks the board once, with each pill's list filters, and reads each total by its pill", async () => {
    getThreadBoard.mockImplementation(answering([12, 4]));
    const requests = [
      { key: 'A view whose name is far longer than forty characters, really', filters: filters() },
      { key: 'Mine', filters: filters({ assigneeId: 'me' }) },
    ];
    const { result } = renderHook(() => useThreadViewCounts(requests, 0));
    await waitFor(() => expect('Mine' in result.current).toBe(true));
    expect(result.current).toEqual({ [requests[0].key]: 12, Mine: 4 });
    expect(getThreadBoard).toHaveBeenCalledTimes(1);
    expect(getThreads).not.toHaveBeenCalled();
    const sent = getThreadBoard.mock.calls[0][0] as BoardRequest;
    // The same filters the list request carries; ids short and unique whatever the names.
    expect(sent.counts.map((count) => count.filters)).toEqual(
      requests.map((request) => threadApiFilters(request.filters, false))
    );
    expect(sent.counts.every((count) => count.id.length <= 40)).toBe(true);
  });

  it('more pills than one request takes go in further requests of twelve', async () => {
    getThreadBoard.mockImplementation((request: unknown) =>
      answering((request as BoardRequest).counts.map(() => 1))(request)
    );
    const requests = Array.from({ length: 14 }, (_, idx) => ({
      key: `view-${idx}`,
      filters: filters({ assigneeId: String(idx + 1) }),
    }));
    const { result } = renderHook(() => useThreadViewCounts(requests, 0));
    await waitFor(() => expect('view-13' in result.current).toBe(true));
    expect(getThreadBoard).toHaveBeenCalledTimes(2);
    expect((getThreadBoard.mock.calls[0][0] as BoardRequest).counts).toHaveLength(12);
    expect(Object.values(result.current).every((count) => count === 1)).toBe(true);
  });

  it('a failed board request leaves the pills without a number — never zero, never a fallback storm', async () => {
    getThreadBoard.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useThreadViewCounts([{ key: 'a', filters: filters() }], 0));
    await waitFor(() => expect('a' in result.current).toBe(true));
    expect(result.current.a).toBeUndefined();
    expect(getThreads).not.toHaveBeenCalled();
  });

  it('[control] a backend without the board route counts each pill with its list request', async () => {
    getThreads.mockResolvedValue({ success: true, data: [], pagination: { total: 7 } });
    const { result } = renderHook(() => useThreadViewCounts([{ key: 'a', filters: filters() }], 0));
    await waitFor(() => expect(result.current.a).toBe(7));
    expect(getThreadBoard).toHaveBeenCalledTimes(1);
    expect(getThreads).toHaveBeenCalledTimes(1);
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
      (props: { shown: string[]; page?: number }) =>
        useNewThreadsBar({
          filters: filters({ lifecycle: 'needs_us' }),
          sorting,
          shownIds: props.shown,
          page: props.page ?? 1,
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
      useNewThreadsBar({ filters: filters(), sorting, shownIds: ['a', 'b'], page: 1 })
    );
    act(() => result.current.probe());
    await waitFor(() => expect(getThreads).toHaveBeenCalled());
    expect(result.current.count).toBe(0);
  });

  it('a check that answers after the page changed announces nothing', async () => {
    let answer: (value: unknown) => void = () => undefined;
    getThreads.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    const { result, rerender } = renderHook(
      (props: { shown: string[]; at: number }) =>
        useNewThreadsBar({ filters: filters(), sorting, shownIds: props.shown, page: props.at }),
      { initialProps: { shown: ['a', 'b'], at: 1 } }
    );
    act(() => result.current.probe());
    // The agent moves to page 2 while page 1's check is in flight.
    rerender({ shown: ['c', 'd'], at: 2 });
    await act(async () => {
      answer(page(['a', 'b', 'new-1']));
      await Promise.resolve();
    });
    expect(result.current.count).toBe(0);
  });

  it('a failed check is asked again, so one bad moment cannot hide new mail', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      getThreads
        .mockRejectedValueOnce(new Error('A server error occurred.'))
        .mockResolvedValueOnce(page(['new-1', 'a']));
      const { result } = renderHook(() =>
        useNewThreadsBar({ filters: filters(), sorting, shownIds: ['a'], page: 1 })
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
        useNewThreadsBar({ filters: filters(), sorting, shownIds: [], page: 1 })
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
