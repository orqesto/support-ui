/**
 * A post-action refresh (mark as read, resolve, …) must not throw away the pages the agent
 * loaded with "Load more". It used to reload page 1 only, which shrank the column to 20
 * cards and jumped the scroll back to the top on every mark-as-read.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, within, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { defaultFilters } from '@/stores/messagesStore';
import { messageService, type MessageThread } from '@/services/message.service';
import { MessagesKanbanView, uniqueThreads } from '../MessagesKanbanView';

vi.mock('@/services/message.service', () => ({
  messageService: { getThreads: vi.fn(), classify: vi.fn(), reopen: vi.fn() },
}));
vi.mock('@/hooks/useDepartmentContextKey', () => ({ useDepartmentContextKey: () => 'dept' }));
vi.mock('@/hooks/useNotificationCounts', () => ({
  useNotificationCounts: () => ({ counts: {}, clearKind: vi.fn() }),
}));
vi.mock('@/components/ui/ReactSelect', () => ({ ReactSelect: () => null }));
vi.mock('../KanbanCard', () => ({
  KanbanCard: ({ thread }: { thread: MessageThread }) => (
    <div data-testid="card">{`${thread.threadId}|${thread.sender}`}</div>
  ),
}));

const PAGE = 20;
const TOTAL = 60;
/** Bumped between renders, so a refetched row is visibly the NEW version. */
let version = 'v1';

const thread = (idx: number): MessageThread =>
  ({
    threadId: `t${idx}`,
    sender: version,
    latestMessage: { id: idx + 1 },
  }) as unknown as MessageThread;

const getThreads = vi.mocked(messageService.getThreads);

beforeEach(() => {
  version = 'v1';
  getThreads.mockReset();
  getThreads.mockImplementation((_filters, page = 1, limit = PAGE) => {
    const start = (page - 1) * limit;
    const rows = Array.from({ length: Math.max(0, Math.min(limit, TOTAL - start)) }, (_, offset) =>
      thread(start + offset)
    );
    return Promise.resolve({
      success: true,
      data: rows,
      pagination: { page, limit, total: TOTAL, totalPages: Math.ceil(TOTAL / limit) },
    } as never);
  });
});

const renderBoard = (refreshKey: number, filters = defaultFilters) => (
  <QueryClientProvider client={new QueryClient()}>
    <MessagesKanbanView
      filters={filters}
      onOpen={() => {}}
      refreshKey={refreshKey}
      onScopeJump={() => {}}
    />
  </QueryClientProvider>
);

const openColumn = () => document.querySelector('[data-column="open"]') as HTMLElement;
const cards = () => within(openColumn()).queryAllByTestId('card');

const loadTwoPages = async () => {
  await waitFor(() => expect(cards()).toHaveLength(PAGE));
  fireEvent.click(within(openColumn()).getByRole('button', { name: /load more/i }));
  await waitFor(() => expect(cards()).toHaveLength(PAGE * 2));
};

describe('Kanban refresh keeps the pages already loaded', () => {
  it('a refreshKey bump re-fetches every loaded page and keeps all 40 cards', async () => {
    const view = render(renderBoard(0));
    await loadTwoPages();
    const scroller = cards()[0].parentElement!.parentElement!;

    getThreads.mockClear();
    version = 'v2';
    view.rerender(renderBoard(1));

    // Refetched in place: every card now carries the new version (e.g. a cleared unread flag)…
    await waitFor(() => expect(cards()[PAGE * 2 - 1].textContent).toBe(`t${PAGE * 2 - 1}|v2`));
    // …and none of the "Load more" rows were dropped.
    expect(cards()).toHaveLength(PAGE * 2);
    // Page 2 was asked for again, not just page 1.
    expect(getThreads.mock.calls.some(([, page, limit]) => page === 2 && limit === PAGE)).toBe(
      true
    );
    // Same scroll container node, so the browser has no reason to reset its position.
    expect(cards()[0].parentElement!.parentElement).toBe(scroller);
  });

  it('a refresh whose page 2 fails keeps the cards and stops "Loading…"', async () => {
    const view = render(renderBoard(0));
    await loadTwoPages();

    const ok = getThreads.getMockImplementation()!;
    getThreads.mockImplementation((filters, page, limit, ...rest) =>
      page === 2 && limit === PAGE
        ? Promise.resolve({ success: false } as never)
        : ok(filters, page, limit, ...rest)
    );
    view.rerender(renderBoard(1));

    await waitFor(() =>
      expect(within(openColumn()).getByRole('button', { name: /load more/i })).toBeTruthy()
    );
    expect(cards()).toHaveLength(PAGE * 2);
  });

  it('a filter change still starts again from page 1', async () => {
    const view = render(renderBoard(0));
    await loadTwoPages();

    getThreads.mockClear();
    view.rerender(renderBoard(0, { ...defaultFilters, search: 'refund' } as never));

    await waitFor(() => expect(cards()).toHaveLength(PAGE));
    expect(getThreads.mock.calls.some(([, page]) => page === 2)).toBe(false);
  });
});

describe('uniqueThreads', () => {
  it('drops a repeated threadId and keeps the first position', () => {
    version = 'a';
    const first = thread(1);
    version = 'b';
    expect(uniqueThreads([first, thread(2), thread(1)]).map((row) => row.sender)).toEqual([
      'a',
      'b',
    ]);
  });
});
