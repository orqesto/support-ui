import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { MessageThread } from '@/services/message.service';
import { defaultFilters, type FilterState } from '@/stores/messagesStore';

/**
 * A customer's workspace, 2026-11-02: an address searched under Needs us showed nothing while
 * all 10 matches sat in Resolved and the knowledge base. A searched list now shows the matches
 * the view does not, grouped by where they are, with a way to go there (search kept).
 */

const getThreads = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/services/message.service', () => ({
  messageService: { getThreads: (...args: unknown[]) => getThreads(...args) },
}));
vi.mock('@/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: false, resolved: true }),
  useRefreshAiDrafts: () => () => undefined,
}));
vi.mock('@/hooks/useDepartments', () => ({ useDepartments: () => ({ data: [] }) }));
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => null }));
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'COR' }));
vi.mock('@/hooks/useDepartmentContextKey', () => ({ useDepartmentContextKey: () => 'all' }));

import {
  ASK_STALE_MS,
  OutsideViewMatches,
  REFRESH_MIN_MS,
} from '../list/OutsideViewMatches';

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

  it('🔴 a refresh after "Show more" reads every page shown — the section keeps its length', async () => {
    getThreads
      .mockResolvedValueOnce(answer([thread(1, 'terminal', 'Row one')], 30))
      .mockResolvedValueOnce(answer([thread(2, 'terminal', 'Row two')], 30));
    const state = filters();
    const { rerender } = render(section(state, vi.fn(), vi.fn(), 'r1'));
    fireEvent.click(await screen.findByRole('button', { name: /Show more/ }));
    await screen.findByText('Row two');
    getThreads.mockResolvedValueOnce(
      answer([thread(1, 'terminal', 'Row one'), thread(2, 'terminal', 'Row two')], 30)
    );
    afterRefreshWindow();
    rerender(section(state, vi.fn(), vi.fn(), 'r2'));
    await waitFor(() => expect(getThreads).toHaveBeenCalledTimes(3));
    // Page 1, two pages' worth of rows.
    expect(getThreads.mock.calls[2]?.[1]).toBe(1);
    expect(getThreads.mock.calls[2]?.[2]).toBe(50);
    expect(screen.getByText('Row two')).toBeTruthy();
  });

  it('🔴 a "Show more" overtaken by a refresh is dropped, not appended at a skipped offset', async () => {
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
    await act(async () => {
      await Promise.resolve();
    });
    more(answer([thread(2, 'terminal', 'Stale page row')], 30));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText('Stale page row')).toBeNull();
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

  it('🔴 a later refresh (no "Show more" meanwhile) drops a row that stopped matching', async () => {
    getThreads
      .mockResolvedValueOnce(answer([thread(1, 'terminal', 'Row one')], 30))
      .mockResolvedValueOnce(answer([thread(2, 'terminal', 'Moved away')], 30));
    const state = filters();
    const { rerender } = render(section(state, vi.fn(), vi.fn(), 'r1'));
    fireEvent.click(await screen.findByRole('button', { name: /Show more/ }));
    await screen.findByText('Moved away');
    getThreads.mockResolvedValueOnce(answer([thread(1, 'terminal', 'Row one')], 1));
    afterRefreshWindow();
    rerender(section(state, vi.fn(), vi.fn(), 'r2'));
    await waitFor(() => expect(screen.queryByText('Moved away')).toBeNull());
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
  it('🔴 a refresh asks within the backend cap, and the page follows what came back', async () => {
    getThreads
      .mockResolvedValueOnce(answer([thread(1, 'terminal', 'P1')], 100))
      .mockResolvedValueOnce(answer([thread(2, 'terminal', 'P2')], 100));
    const state = filters();
    const { rerender } = render(section(state, vi.fn(), vi.fn(), 'r1'));
    fireEvent.click(await screen.findByRole('button', { name: /Show more/ }));
    await screen.findByText('P2');
    // Two pages shown: the refresh asks 50 and gets 30 back → one-and-a-bit pages, i.e. page 2.
    getThreads.mockResolvedValueOnce(
      answer(Array.from({ length: 30 }, (_, index) => thread(100 + index, 'terminal', `R${index}`)), 100)
    );
    afterRefreshWindow();
    rerender(section(state, vi.fn(), vi.fn(), 'r2'));
    await waitFor(() => expect(getThreads).toHaveBeenCalledTimes(3));
    expect(getThreads.mock.calls[2]?.[2]).toBe(50);
    await screen.findByText('R29');
    getThreads.mockResolvedValueOnce(answer([thread(4, 'terminal', 'Next')], 100));
    fireEvent.click(screen.getByRole('button', { name: /Show more/ }));
    await waitFor(() => expect(getThreads).toHaveBeenCalledTimes(4));
    expect(getThreads.mock.calls[3]?.[1]).toBe(3);
  });

  it('🔴 past the cap (3 pages shown) a list move does not refresh and cut the section to 50', async () => {
    getThreads
      .mockResolvedValueOnce(answer([thread(1, 'terminal', 'P1')], 100))
      .mockResolvedValueOnce(answer([thread(2, 'terminal', 'P2')], 100))
      .mockResolvedValueOnce(answer([thread(3, 'terminal', 'P3')], 100));
    const state = filters();
    const { rerender } = render(section(state, vi.fn(), vi.fn(), 'r1'));
    fireEvent.click(await screen.findByRole('button', { name: /Show more/ }));
    await screen.findByText('P2');
    fireEvent.click(screen.getByRole('button', { name: /Show more/ }));
    await screen.findByText('P3');
    afterRefreshWindow();
    rerender(section(state, vi.fn(), vi.fn(), 'r2'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(getThreads).toHaveBeenCalledTimes(3);
    expect(screen.getByText('P3')).toBeTruthy();
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
    expect(getThreads.mock.calls[2]?.[2]).toBe(25);
  });

  // Round-8 review.
  it('🔴 a refresh that fails after a Show more added rows keeps them, and the section recovers', async () => {
    getThreads
      .mockResolvedValueOnce(answer([thread(1, 'terminal', 'Row one')], 30))
      .mockResolvedValueOnce(answer([thread(2, 'terminal', 'Row two')], 30));
    const state = filters();
    const { rerender } = render(section(state, vi.fn(), vi.fn(), 'r1'));
    fireEvent.click(await screen.findByRole('button', { name: /Show more/ }));
    await screen.findByText('Row two');
    let refreshFail: (reason: unknown) => void = () => undefined;
    getThreads.mockImplementationOnce(() => new Promise((_resolve, reject) => (refreshFail = reject)));
    afterRefreshWindow();
    rerender(section(state, vi.fn(), vi.fn(), 'r2'));
    await waitFor(() => expect(getThreads).toHaveBeenCalledTimes(3));
    getThreads.mockResolvedValueOnce(answer([thread(3, 'terminal', 'Row three')], 30));
    fireEvent.click(screen.getByRole('button', { name: /Show more/ }));
    await screen.findByText('Row three');
    refreshFail(new Error('503'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText('Row two')).toBeTruthy();
    expect(screen.queryByText(/could not be checked/)).toBeNull();
  });

  it('🔴 a refresh bringing back fewer rows than one page sets one page, so Show more asks page 2', async () => {
    getThreads
      .mockResolvedValueOnce(answer([thread(1, 'terminal', 'P1')], 40))
      .mockResolvedValueOnce(answer([thread(2, 'terminal', 'P2')], 40));
    const state = filters();
    const { rerender } = render(section(state, vi.fn(), vi.fn(), 'r1'));
    fireEvent.click(await screen.findByRole('button', { name: /Show more/ }));
    await screen.findByText('P2');
    // Matches moved away: the refresh (2 pages asked) brings back 10 rows.
    getThreads.mockResolvedValueOnce(
      answer(Array.from({ length: 10 }, (_, index) => thread(200 + index, 'terminal', `S${index}`)), 40)
    );
    afterRefreshWindow();
    rerender(section(state, vi.fn(), vi.fn(), 'r2'));
    await screen.findByText('S9');
    getThreads.mockResolvedValueOnce(answer([thread(5, 'terminal', 'Next')], 40));
    fireEvent.click(screen.getByRole('button', { name: /Show more/ }));
    await waitFor(() => expect(getThreads).toHaveBeenCalledTimes(4));
    expect(getThreads.mock.calls[3]?.[1]).toBe(2);
  });
});

