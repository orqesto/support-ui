import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { MessageThread } from '@/services/message.service';
import { defaultFilters, type FilterState } from '@/features/messages/stores/messagesStore';

/**
 * A customer's workspace, 2026-11-02: an address searched under Needs us showed nothing while
 * all 10 matches sat in Resolved and the knowledge base. A searched list now shows the matches
 * the view does not, grouped by where they are, with a way to go there (search kept).
 */

const getThreads = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/services/message.service', () => ({
  messageService: { getThreads: (...args: unknown[]) => getThreads(...args) },
}));
vi.mock('@/features/settings/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: false, resolved: true }),
  useRefreshAiDrafts: () => () => undefined,
}));
vi.mock('@/hooks/useDepartments', () => ({ useDepartments: () => ({ data: [] }) }));
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => null }));
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'COR' }));
vi.mock('@/hooks/useDepartmentContextKey', () => ({ useDepartmentContextKey: () => 'all' }));

import { ASK_STALE_MS, OutsideViewMatches, REFRESH_MIN_MS } from '../list/OutsideViewMatches';

const REFRESH = 'Refresh matches in other views';

const thread = (id: number, foundIn?: string, subject = `Order ${id}`): MessageThread =>
  ({
    threadId: `conv_${id}`,
    sender: `customer${id}@shop.example`,
    subject,
    lastMessageAt: new Date().toISOString(),
    foundIn,
    latestMessage: {
      id,
      conversationId: id,
      type: 'inbound',
      subject,
      content: '<p>text</p>',
      channel: 'email',
      status: 'resolved',
      createdAt: new Date().toISOString(),
    },
  }) as unknown as MessageThread;

const answer = (rows: MessageThread[], total = rows.length) => ({
  success: true,
  outsideView: true,
  data: rows,
  pagination: { page: 1, limit: 25, total, totalPages: 1 },
});

/** Moves the clock past the refresh window, so the next `refreshKey` move asks at once. */
let clockOffset = 0;
const realNow = Date.now.bind(Date);
let clockSpy: { mockRestore: () => void } | null = null;
const afterRefreshWindow = () => {
  clockOffset += REFRESH_MIN_MS + 1;
  clockSpy ??= vi.spyOn(Date, 'now').mockImplementation(() => realNow() + clockOffset);
};

const filters = (patch: Partial<FilterState> = {}): FilterState => ({
  ...defaultFilters,
  lifecycle: 'needs_us',
  search: 'someone@shop.example',
  ...patch,
});

const section = (
  state: FilterState,
  onJump = vi.fn(),
  onOpen = vi.fn(),
  refreshKey = 'r1',
  enabled = true
) => (
  <MemoryRouter>
    <OutsideViewMatches
      filters={state}
      onJump={onJump}
      onOpen={onOpen}
      refreshKey={refreshKey}
      enabled={enabled}
    />
  </MemoryRouter>
);

// A block body: vitest runs a function RETURNED from beforeEach as a teardown, and `mockReset()`
// returns the mock — so it called getThreads() after each test (hung on a never-settling answer).
beforeEach(() => {
  getThreads.mockReset();
});
afterEach(() => {
  cleanup();
  clockSpy?.mockRestore();
  clockSpy = null;
  clockOffset = 0;
});

describe('OutsideViewMatches — refreshes and Show more', () => {
  // Release review, round 3.
  it('🔴 an ask that never answers is replaced after ASK_STALE_MS', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      getThreads
        .mockImplementationOnce(() => new Promise(() => undefined))
        .mockResolvedValueOnce(answer([thread(1, 'terminal', 'After the hang')]));
      const state = filters();
      const { rerender } = render(section(state, vi.fn(), vi.fn(), 'r1'));
      await vi.waitFor(() => expect(getThreads).toHaveBeenCalledTimes(1));
      rerender(section(state, vi.fn(), vi.fn(), 'r2'));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ASK_STALE_MS);
      });
      expect(getThreads).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('🔴 "Show more" keeps its answer when the list rows moved meanwhile', async () => {
    let more: (value: unknown) => void = () => undefined;
    getThreads
      .mockResolvedValueOnce(answer([thread(1, 'terminal', 'First row')], 30))
      .mockImplementationOnce(() => new Promise((resolve) => (more = resolve)));
    const state = filters();
    const { rerender } = render(section(state, vi.fn(), vi.fn(), 'r1'));
    fireEvent.click(await screen.findByRole('button', { name: /Show more/ }));
    rerender(section(state, vi.fn(), vi.fn(), 'r2'));
    more(answer([thread(2, 'terminal', 'Second page row')], 30));
    expect(await screen.findByText('Second page row')).toBeTruthy();
  });

  it('🔴 a "Show more" that lands after a refresh is appended (a refresh only replaces page 1)', async () => {
    getThreads.mockResolvedValueOnce(answer([thread(1, 'terminal', 'Row one')], 30));
    const state = filters();
    const { rerender } = render(section(state, vi.fn(), vi.fn(), 'r1'));
    await screen.findByText('Row one');
    let more: (value: unknown) => void = () => undefined;
    getThreads.mockImplementationOnce(() => new Promise((resolve) => (more = resolve)));
    fireEvent.click(screen.getByRole('button', { name: /Show more/ }));
    await waitFor(() => expect(getThreads).toHaveBeenCalledTimes(2));
    getThreads.mockResolvedValueOnce(answer([thread(1, 'terminal', 'Row one')], 30));
    afterRefreshWindow();
    rerender(section(state, vi.fn(), vi.fn(), 'r2'));
    await waitFor(() => expect(getThreads).toHaveBeenCalledTimes(3));
    more(answer([thread(2, 'terminal', 'Page two row')], 30));
    expect(await screen.findByText('Page two row')).toBeTruthy();
  });

  it('🔴 a hung ask is replaced even when the list re-reads (enabled off and on) meanwhile', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      getThreads
        .mockImplementationOnce(() => new Promise(() => undefined))
        .mockResolvedValueOnce(answer([thread(1, 'terminal', 'After the hang')]));
      const state = filters();
      const { rerender } = render(section(state, vi.fn(), vi.fn(), 'r1', true));
      await vi.waitFor(() => expect(getThreads).toHaveBeenCalledTimes(1));
      rerender(section(state, vi.fn(), vi.fn(), 'r1', false));
      rerender(section(state, vi.fn(), vi.fn(), 'r1', true));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ASK_STALE_MS);
      });
      expect(getThreads).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('🔴 a first ask that never answers on a quiet inbox is replaced after ASK_STALE_MS', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      getThreads
        .mockImplementationOnce(() => new Promise(() => undefined))
        .mockResolvedValueOnce(answer([thread(1, 'terminal', 'Second try')]));
      render(section(filters(), vi.fn(), vi.fn(), 'r1'));
      await vi.waitFor(() => expect(getThreads).toHaveBeenCalledTimes(1));
      // Nothing re-renders the section: only its own timer may replace the ask.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ASK_STALE_MS);
      });
      expect(getThreads).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  // Round-6 review.
  it('🔴 after a "Show more", a list move does not refresh (the pages stay as the agent asked)', async () => {
    getThreads
      .mockResolvedValueOnce(answer([thread(1, 'terminal', 'P1')], 100))
      .mockResolvedValueOnce(answer([thread(2, 'terminal', 'P2')], 100));
    const state = filters();
    const { rerender } = render(section(state, vi.fn(), vi.fn(), 'r1'));
    fireEvent.click(await screen.findByRole('button', { name: /Show more/ }));
    await screen.findByText('P2');
    afterRefreshWindow();
    rerender(section(state, vi.fn(), vi.fn(), 'r2'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(getThreads).toHaveBeenCalledTimes(2);
    expect(screen.getByText('P2')).toBeTruthy();
  });

  it('[control] without "Show more", a later refresh replaces the rows (a row that stopped matching leaves)', async () => {
    getThreads.mockResolvedValueOnce(answer([thread(1, 'terminal', 'Moved away')], 1));
    const state = filters();
    const { rerender } = render(section(state, vi.fn(), vi.fn(), 'r1'));
    await screen.findByText('Moved away');
    getThreads.mockResolvedValueOnce(answer([thread(2, 'terminal', 'Still here')], 1));
    afterRefreshWindow();
    rerender(section(state, vi.fn(), vi.fn(), 'r2'));
    await screen.findByText('Still here');
    expect(screen.queryByText('Moved away')).toBeNull();
  });

  it('🔴 a "Show more" still out when the search changes and changes back is not appended', async () => {
    getThreads.mockResolvedValueOnce(answer([thread(1, 'terminal', 'A one')], 30));
    const { rerender } = render(section(filters({ search: 'a@shop.example' })));
    await screen.findByText('A one');
    let more: (value: unknown) => void = () => undefined;
    getThreads.mockImplementationOnce(() => new Promise((resolve) => (more = resolve)));
    fireEvent.click(screen.getByRole('button', { name: /Show more/ }));
    await waitFor(() => expect(getThreads).toHaveBeenCalledTimes(2));
    getThreads.mockImplementation(() => new Promise(() => undefined));
    rerender(section(filters({ search: 'b@shop.example' })));
    rerender(section(filters({ search: 'a@shop.example' })));
    more(answer([thread(2, 'terminal', 'A page two')], 30));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText('A page two')).toBeNull();
  });

  it('🔴 a Show more pressed BEFORE the refresh, landing after it was asked, keeps its page', async () => {
    getThreads.mockResolvedValueOnce(answer([thread(1, 'terminal', 'Row one')], 30));
    const state = filters();
    const { rerender } = render(section(state, vi.fn(), vi.fn(), 'r1'));
    await screen.findByText('Row one');
    let more: (value: unknown) => void = () => undefined;
    getThreads.mockImplementationOnce(() => new Promise((resolve) => (more = resolve)));
    fireEvent.click(screen.getByRole('button', { name: /Show more/ }));
    await waitFor(() => expect(getThreads).toHaveBeenCalledTimes(2));
    let refreshed: (value: unknown) => void = () => undefined;
    getThreads.mockImplementationOnce(() => new Promise((resolve) => (refreshed = resolve)));
    afterRefreshWindow();
    rerender(section(state, vi.fn(), vi.fn(), 'r2'));
    await waitFor(() => expect(getThreads).toHaveBeenCalledTimes(3));
    more(answer([thread(2, 'terminal', 'Row two')], 30));
    await screen.findByText('Row two');
    refreshed(answer([thread(1, 'terminal', 'Row one')], 30));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText('Row two')).toBeTruthy();
  });

  it('"Show more" updates the total from its own answer', async () => {
    getThreads
      .mockResolvedValueOnce(answer([thread(1, 'terminal', 'Row one')], 30))
      .mockResolvedValueOnce(answer([thread(2, 'terminal', 'Row two')], 42));
    const { container } = render(section(filters()));
    fireEvent.click(await screen.findByRole('button', { name: /Show more/ }));
    await screen.findByText('Row two');
    expect(container.textContent).toMatch(/Also found in other views\s*42/);
  });

  it('🔴 a refresh that lands after a "Show more" made meanwhile keeps the added page', async () => {
    getThreads.mockResolvedValueOnce(answer([thread(1, 'terminal', 'Row one')], 30));
    const state = filters();
    const { rerender } = render(section(state, vi.fn(), vi.fn(), 'r1'));
    await screen.findByText('Row one');
    let refreshed: (value: unknown) => void = () => undefined;
    getThreads.mockImplementationOnce(() => new Promise((resolve) => (refreshed = resolve)));
    afterRefreshWindow();
    rerender(section(state, vi.fn(), vi.fn(), 'r2'));
    await waitFor(() => expect(getThreads).toHaveBeenCalledTimes(2));
    getThreads.mockResolvedValueOnce(answer([thread(2, 'terminal', 'Row two')], 30));
    fireEvent.click(screen.getByRole('button', { name: /Show more/ }));
    await screen.findByText('Row two');
    refreshed(answer([thread(1, 'terminal', 'Row one')], 30));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText('Row two')).toBeTruthy();
  });

  it('🔴 a new search asks for one page, whatever the old one showed', async () => {
    getThreads
      .mockResolvedValueOnce(answer([thread(1, 'terminal', 'Old one')], 30))
      .mockResolvedValueOnce(answer([thread(2, 'terminal', 'Old two')], 30))
      .mockResolvedValueOnce(answer([thread(3, 'terminal', 'New one')], 30));
    const { rerender } = render(section(filters({ search: 'one@shop.example' })));
    fireEvent.click(await screen.findByRole('button', { name: /Show more/ }));
    await screen.findByText('Old two');
    rerender(section(filters({ search: 'two@shop.example' })));
    await screen.findByText('New one');
    // Back at page 1: nothing to refresh yet, and the next Show more asks page 2, not 3.
    expect(screen.queryByRole('button', { name: REFRESH })).toBeNull();
    getThreads.mockResolvedValueOnce(answer([thread(4, 'terminal', 'New two')], 30));
    fireEvent.click(screen.getByRole('button', { name: /Show more/ }));
    await screen.findByText('New two');
    expect(getThreads.mock.calls[3]?.[1]).toBe(2);
  });

  it('🔴 a new search says "Checking…" while its answer is out (round-17 review)', async () => {
    getThreads
      .mockResolvedValueOnce(answer([thread(1, 'terminal', 'Old one')], 1))
      .mockReturnValueOnce(new Promise(() => {}));
    const { rerender } = render(section(filters({ search: 'one@shop.example' })));
    await screen.findByText('Old one');
    rerender(section(filters({ search: 'two@shop.example' })));
    await waitFor(() => expect(getThreads).toHaveBeenCalledTimes(2));
    expect(screen.getByText(/Checking other views/)).toBeTruthy();
  });

  it('🔴 a refresh that fails after a Show more added rows (while it was out) keeps them', async () => {
    getThreads.mockResolvedValueOnce(answer([thread(1, 'terminal', 'Row one')], 30));
    const state = filters();
    const { rerender } = render(section(state, vi.fn(), vi.fn(), 'r1'));
    await screen.findByText('Row one');
    let refreshFail: (reason: unknown) => void = () => undefined;
    getThreads.mockImplementationOnce(
      () => new Promise((_resolve, reject) => (refreshFail = reject))
    );
    afterRefreshWindow();
    rerender(section(state, vi.fn(), vi.fn(), 'r2'));
    await waitFor(() => expect(getThreads).toHaveBeenCalledTimes(2));
    getThreads.mockResolvedValueOnce(answer([thread(2, 'terminal', 'Row two')], 30));
    fireEvent.click(screen.getByRole('button', { name: /Show more/ }));
    await screen.findByText('Row two');
    refreshFail(new Error('503'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText('Row two')).toBeTruthy();
    expect(screen.queryByText(/could not be checked/)).toBeNull();
  });

  // Round-9 review.
  it('🔴 a Show more landing after a failed refresh does not append to the cleared section', async () => {
    getThreads.mockResolvedValueOnce(answer([thread(1, 'terminal', 'Row one')], 30));
    const state = filters();
    const { rerender } = render(section(state, vi.fn(), vi.fn(), 'r1'));
    await screen.findByText('Row one');
    let refreshFail: (reason: unknown) => void = () => undefined;
    getThreads.mockImplementationOnce(
      () => new Promise((_resolve, reject) => (refreshFail = reject))
    );
    afterRefreshWindow();
    rerender(section(state, vi.fn(), vi.fn(), 'r2'));
    await waitFor(() => expect(getThreads).toHaveBeenCalledTimes(2));
    let more: (value: unknown) => void = () => undefined;
    getThreads.mockImplementationOnce(() => new Promise((resolve) => (more = resolve)));
    fireEvent.click(screen.getByRole('button', { name: /Show more/ }));
    await waitFor(() => expect(getThreads).toHaveBeenCalledTimes(3));
    refreshFail(new Error('503'));
    await screen.findByText(/could not be checked/);
    more(answer([thread(2, 'terminal', 'Stray page')], 30));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText('Stray page')).toBeNull();
  });

  // Round-11 review.
  it("🔴 an older backend's answer to a refresh also drops a Show more still out", async () => {
    getThreads.mockResolvedValueOnce(answer([thread(1, 'terminal', 'Row one')], 30));
    const state = filters();
    const { rerender } = render(section(state, vi.fn(), vi.fn(), 'r1'));
    await screen.findByText('Row one');
    let refreshed: (value: unknown) => void = () => undefined;
    getThreads.mockImplementationOnce(() => new Promise((resolve) => (refreshed = resolve)));
    afterRefreshWindow();
    rerender(section(state, vi.fn(), vi.fn(), 'r2'));
    await waitFor(() => expect(getThreads).toHaveBeenCalledTimes(2));
    let more: (value: unknown) => void = () => undefined;
    getThreads.mockImplementationOnce(() => new Promise((resolve) => (more = resolve)));
    fireEvent.click(screen.getByRole('button', { name: /Show more/ }));
    await waitFor(() => expect(getThreads).toHaveBeenCalledTimes(3));
    refreshed({ ...answer([thread(9, undefined, 'View row')]), outsideView: undefined });
    await act(async () => {
      await Promise.resolve();
    });
    more(answer([thread(2, 'terminal', 'Stray page')], 30));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText('Stray page')).toBeNull();
  });

  it('🔴 unmounting aborts a Show more in flight', async () => {
    const signals: AbortSignal[] = [];
    getThreads.mockResolvedValueOnce(answer([thread(1, 'terminal', 'Row one')], 30));
    getThreads.mockImplementationOnce((...args: unknown[]) => {
      const opts = args[5] as { signal?: AbortSignal } | undefined;
      if (opts?.signal) signals.push(opts.signal);
      return new Promise(() => undefined);
    });
    const { unmount } = render(section(filters()));
    fireEvent.click(await screen.findByRole('button', { name: /Show more/ }));
    await waitFor(() => expect(signals).toHaveLength(1));
    unmount();
    expect(signals[0]?.aborted).toBe(true);
  });

  // Round-14 review.
  it('🔴 a Show more aborted by a search change says nothing when the agent switches back', async () => {
    getThreads.mockResolvedValueOnce(answer([thread(1, 'terminal', 'A one')], 30));
    const { rerender } = render(section(filters({ search: 'a@shop.example' })));
    await screen.findByText('A one');
    let moreFail: (reason: unknown) => void = () => undefined;
    getThreads.mockImplementationOnce(() => new Promise((_resolve, reject) => (moreFail = reject)));
    fireEvent.click(screen.getByRole('button', { name: /Show more/ }));
    await waitFor(() => expect(getThreads).toHaveBeenCalledTimes(2));
    getThreads
      .mockImplementationOnce(() => new Promise(() => undefined)) // B, never answers
      .mockResolvedValueOnce(answer([thread(1, 'terminal', 'A again')], 30)); // A, asked afresh
    rerender(section(filters({ search: 'b@shop.example' })));
    rerender(section(filters({ search: 'a@shop.example' })));
    await screen.findByText('A again');
    moreFail(new DOMException('aborted', 'AbortError'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText(/Could not load more/i)).toBeNull();
  });

  it('"Show more" carries its answer\'s capped flag ("N+")', async () => {
    getThreads
      .mockResolvedValueOnce(answer([thread(1, 'terminal', 'Row one')], 30))
      .mockResolvedValueOnce({
        ...answer([thread(2, 'terminal', 'Row two')], 10000),
        pagination: { page: 2, limit: 25, total: 10000, totalPages: 400, totalCapped: true },
      });
    const { container } = render(section(filters()));
    fireEvent.click(await screen.findByRole('button', { name: /Show more/ }));
    await screen.findByText('Row two');
    expect(container.textContent).toContain('10,000+');
  });

  // Round-15 review.
  it('🔴 Refresh (shown once paged) brings back a fresh first page on demand', async () => {
    getThreads
      .mockResolvedValueOnce(answer([thread(1, 'terminal', 'Old one')], 30))
      .mockResolvedValueOnce(answer([thread(2, 'terminal', 'Old two')], 30))
      .mockResolvedValueOnce(answer([thread(3, 'terminal', 'Fresh one')], 1));
    render(section(filters()));
    expect(screen.queryByRole('button', { name: REFRESH })).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: /Show more/ }));
    await screen.findByText('Old two');
    fireEvent.click(screen.getByRole('button', { name: REFRESH }));
    await screen.findByText('Fresh one');
    expect(getThreads.mock.calls[2]?.[1]).toBe(1);
    expect(screen.queryByText('Old two')).toBeNull();
  });

  it('"Show more" without a total leaves the total as it was', async () => {
    getThreads
      .mockResolvedValueOnce(answer([thread(1, 'terminal', 'Row one')], 30))
      .mockResolvedValueOnce({
        ...answer([thread(2, 'terminal', 'Row two')]),
        pagination: undefined,
      });
    const { container } = render(section(filters()));
    fireEvent.click(await screen.findByRole('button', { name: /Show more/ }));
    await screen.findByText('Row two');
    expect(container.textContent).toMatch(/Also found in other views\s*30/);
    // Read without a total, the answer is still a success — no "could not load more".
    expect(screen.queryByText(/Could not load more/i)).toBeNull();
  });

  // Round-16 review.
  it('🔴 Refresh cancels a Show more, clears the section, and pages from 1 again', async () => {
    getThreads
      .mockResolvedValueOnce(answer([thread(1, 'terminal', 'Old one')], 30))
      .mockResolvedValueOnce(answer([thread(2, 'terminal', 'Old two')], 30));
    const signals: AbortSignal[] = [];
    render(section(filters()));
    fireEvent.click(await screen.findByRole('button', { name: /Show more/ }));
    await screen.findByText('Old two');
    // A Show more out when Refresh is pressed is cancelled with everything else.
    getThreads.mockImplementationOnce((...args: unknown[]) => {
      const opts = args[5] as { signal?: AbortSignal } | undefined;
      if (opts?.signal) signals.push(opts.signal);
      return new Promise(() => undefined);
    });
    fireEvent.click(screen.getByRole('button', { name: /Show more/ }));
    await waitFor(() => expect(signals).toHaveLength(1));
    getThreads.mockResolvedValueOnce(answer([thread(3, 'terminal', 'Fresh one')], 30));
    fireEvent.click(screen.getByRole('button', { name: REFRESH }));
    expect(signals[0]?.aborted).toBe(true);
    // Cleared while it asks: nothing old to press Show more on.
    expect(screen.queryByText('Old two')).toBeNull();
    await screen.findByText('Fresh one');
    getThreads.mockResolvedValueOnce(answer([thread(4, 'terminal', 'Page two')], 30));
    fireEvent.click(screen.getByRole('button', { name: /Show more/ }));
    await screen.findByText('Page two');
    // Paging restarts after the fresh first page: page 2, not 3.
    expect(getThreads.mock.calls.at(-1)?.[1]).toBe(2);
  });

  it('🔴 Refresh asks at once while an older refresh is still out', async () => {
    getThreads.mockResolvedValueOnce(answer([thread(1, 'terminal', 'Row one')], 30));
    const state = filters();
    const { rerender } = render(section(state, vi.fn(), vi.fn(), 'r1'));
    await screen.findByText('Row one');
    getThreads.mockImplementationOnce(() => new Promise(() => undefined)); // older refresh hangs
    afterRefreshWindow();
    rerender(section(state, vi.fn(), vi.fn(), 'r2'));
    await waitFor(() => expect(getThreads).toHaveBeenCalledTimes(2));
    getThreads.mockResolvedValueOnce(answer([thread(2, 'terminal', 'Row two')], 30));
    fireEvent.click(screen.getByRole('button', { name: /Show more/ }));
    await screen.findByText('Row two');
    getThreads.mockResolvedValueOnce(answer([thread(3, 'terminal', 'Fresh one')], 30));
    fireEvent.click(screen.getByRole('button', { name: REFRESH }));
    expect(await screen.findByText('Fresh one')).toBeTruthy();
  });
});
