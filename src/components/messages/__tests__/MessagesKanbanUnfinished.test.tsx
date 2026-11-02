/**
 * A column whose read did not finish says so — never "0" and "No resolved threads".
 *
 * A customer's workspace, 2026-11-02: a searched board showed every column empty and "Resolved 0"
 * while the list (All) showed the three resolved matches. The Resolved column's search had run out
 * of time; the board kept the column's freshly reset state (no rows, total 0) and drew that as an
 * answer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { defaultFilters } from '@/stores/messagesStore';
import {
  messageService,
  type MessageThread,
  type ThreadBoardAnswer,
  type ThreadsResponse,
} from '@/services/message.service';
import type { ThreadBoardRequest } from '@/services/threadsQuery';
import { MessagesKanbanView } from '../MessagesKanbanView';

vi.mock('@/services/message.service', () => ({
  messageService: {
    getThreads: vi.fn(),
    getThreadBoard: vi.fn(),
    classify: vi.fn(),
    reopen: vi.fn(),
  },
}));
vi.mock('@/hooks/useDepartmentContextKey', () => ({ useDepartmentContextKey: () => 'dept' }));
vi.mock('@/hooks/useNotificationCounts', () => ({
  NOTIFICATION_COUNTS_KEY: ['notification-counts'],
  useNotificationCounts: () => ({ counts: {}, clearKind: vi.fn() }),
}));
vi.mock('@/components/ui/Select', () => ({ Select: () => null }));
vi.mock('../KanbanCard', () => ({
  KanbanCard: ({ thread }: { thread: MessageThread }) => (
    <div data-testid="card">{thread.threadId}</div>
  ),
}));

const getThreads = vi.mocked(messageService.getThreads);
const getThreadBoard = vi.mocked(messageService.getThreadBoard);

const empty = (): ThreadsResponse =>
  ({
    success: true,
    data: [],
    pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
    search: null,
  }) as unknown as ThreadsResponse;

/** Every column answers empty except those listed, which did not finish (`null`). */
const boardAnswer =
  (unfinished: string[]) =>
  (request: ThreadBoardRequest): ThreadBoardAnswer => ({
    columns: Object.fromEntries(
      request.columns.map((col) => [col.id, unfinished.includes(col.id) ? null : [empty()]])
    ),
    counts: Object.fromEntries(request.counts.map((count) => [count.id, null])) as never,
  });

const client = new QueryClient();
const board = (refreshKey = 0, onTotalChange?: (total: number, partial: boolean) => void) => (
  <QueryClientProvider client={client}>
    <MessagesKanbanView
      filters={{ ...defaultFilters, search: 'someone@shop.example' }}
      onOpen={() => {}}
      refreshKey={refreshKey}
      onScopeJump={() => {}}
      onTotalChange={onTotalChange}
    />
  </QueryClientProvider>
);

beforeEach(() => {
  getThreads.mockReset();
  getThreadBoard.mockReset();
  getThreads.mockResolvedValue(empty());
});

describe('Board: a column that did not finish', () => {
  it('says "not loaded" with no count, instead of "0" and "No … threads"', async () => {
    getThreadBoard.mockImplementation((request) =>
      Promise.resolve(boardAnswer(['open', 'resolved'])(request))
    );
    render(board());
    expect(await screen.findByText(/Not loaded\. Refresh to try again/)).toBeInTheDocument();
    expect(screen.queryByText('No open threads')).toBeNull();
    // CONTROL: a column that answered with no rows still says it is empty.
    expect(screen.getByText('Nothing in progress')).toBeInTheDocument();
    // The Show toggle of an unfinished column carries no number either.
    const resolvedToggle = screen.getByRole('button', { name: /Resolved/ });
    expect(within(resolvedToggle).getByText('—')).toBeInTheDocument();
    // The column's own "—" says what it means to a screen reader too (no bare dash).
    expect(screen.getAllByText('Not loaded', { exact: true }).length).toBeGreaterThan(0);
  });

  it('the same when the board is read one column at a time and a column times out', async () => {
    getThreadBoard.mockResolvedValue(null);
    getThreads.mockImplementation((filters) =>
      (filters as Record<string, string>).lifecycle === 'open'
        ? Promise.reject(new Error('The thread list took too long and was stopped.'))
        : Promise.resolve(empty())
    );
    render(board());
    expect(await screen.findByText(/Not loaded\. Refresh to try again/)).toBeInTheDocument();
    expect(screen.queryByText('No open threads')).toBeNull();
  });

  // Review of #798: the board request itself failing (500, 429, network) left "0" behind too.
  it('says "not loaded" when the board request fails', async () => {
    getThreadBoard.mockRejectedValue(new Error('503'));
    render(board());
    expect(
      (await screen.findAllByText(/Not loaded\. Refresh to try again/)).length
    ).toBeGreaterThan(0);
    expect(screen.queryByText('No open threads')).toBeNull();
  });

  it('a later answer clears "not loaded"', async () => {
    getThreadBoard.mockImplementationOnce((request) =>
      Promise.resolve(boardAnswer(['open'])(request))
    );
    const { rerender } = render(board(0));
    expect(await screen.findByText(/Not loaded\. Refresh to try again/)).toBeInTheDocument();
    getThreadBoard.mockImplementation((request) => Promise.resolve(boardAnswer([])(request)));
    rerender(board(1));
    expect(await screen.findByText('No open threads')).toBeInTheDocument();
    expect(screen.queryByText(/Not loaded\. Refresh to try again/)).toBeNull();
  });

  it('tells the page its total is only partial while a column did not finish', async () => {
    getThreadBoard.mockImplementation((request) => Promise.resolve(boardAnswer(['open'])(request)));
    const onTotalChange = vi.fn();
    render(board(0, onTotalChange));
    await screen.findByText(/Not loaded\. Refresh to try again/);
    expect(onTotalChange).toHaveBeenLastCalledWith(0, true);
  });
});

// Release review, 2026-11-02: a column counted to the search cap read "10,000+" while the header
// summed it into an exact-looking "10,0xx on this board".
describe('Board: a column counted to the cap', () => {
  const capped = (): ThreadsResponse =>
    ({
      success: true,
      data: [],
      pagination: { page: 1, limit: 20, total: 10000, totalPages: 500, totalCapped: true },
      search: null,
    }) as unknown as ThreadsResponse;

  it('🔴 makes the board total "at least" (partial)', async () => {
    getThreadBoard.mockImplementation((request) =>
      Promise.resolve({
        columns: Object.fromEntries(
          request.columns.map((col) => [col.id, [col.id === 'open' ? capped() : empty()]])
        ),
        counts: Object.fromEntries(request.counts.map((count) => [count.id, null])) as never,
      })
    );
    const onTotalChange = vi.fn();
    render(board(0, onTotalChange));
    await waitFor(() => expect(onTotalChange).toHaveBeenLastCalledWith(10000, true));
  });

  it('[control] exact columns give an exact total', async () => {
    getThreadBoard.mockImplementation((request) => Promise.resolve(boardAnswer([])(request)));
    const onTotalChange = vi.fn();
    render(board(0, onTotalChange));
    await waitFor(() => expect(onTotalChange).toHaveBeenLastCalledWith(0, false));
  });
});

