/**
 * The board reads itself in ONE request (`getThreadBoard` → `POST /threads/board`) where it
 * used to send one search per column, one per unread badge and one for its scope — nine per
 * refresh. A backend without the route answers `null` and the board reads itself the old way.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

const page = (colId: string, total: number, pageNo = 1): ThreadsResponse =>
  ({
    success: true,
    data: [{ threadId: `${colId}-${pageNo}`, latestMessage: { id: 1 } }],
    pagination: { page: pageNo, limit: 20, total, totalPages: 50 },
    search: null,
  }) as unknown as ThreadsResponse;

// Each column answers with its own total (open 11, in_progress 12, …), the unread counts 2 each.
const boardAnswer = (request: ThreadBoardRequest): ThreadBoardAnswer => ({
  columns: Object.fromEntries(
    request.columns.map((col, idx) => [
      col.id,
      Array.from({ length: col.pages }, (_, pageIdx) => page(col.id, 11 + idx, pageIdx + 1)),
    ])
  ),
  counts: Object.fromEntries(
    request.counts.map((count) => [
      count.id,
      { pagination: { page: 1, limit: 1, total: 2, totalPages: 2 }, scope: null },
    ])
  ) as ThreadBoardAnswer['counts'],
});

beforeEach(() => {
  getThreads.mockReset();
  getThreadBoard.mockReset();
  getThreads.mockResolvedValue({
    success: true,
    data: [],
    pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
  } as never);
  getThreadBoard.mockImplementation((request) => Promise.resolve(boardAnswer(request)));
});

const renderBoard = (refreshKey: number) => (
  <QueryClientProvider client={new QueryClient()}>
    <MessagesKanbanView
      filters={defaultFilters}
      onOpen={() => {}}
      refreshKey={refreshKey}
      onScopeJump={() => {}}
    />
  </QueryClientProvider>
);

describe('Board in one request', () => {
  it('loads every column, the unread badge and the scope in one request, and no search', async () => {
    render(renderBoard(0));
    await waitFor(() => expect(getThreadBoard).toHaveBeenCalledTimes(1));
    const [request] = getThreadBoard.mock.calls[0];
    expect(request.columns.map((col) => col.id)).toEqual([
      'open',
      'in_progress',
      'awaiting',
      'on_hold',
      'resolved',
    ]);
    expect(request.columns[0]).toMatchObject({
      filters: { lifecycle: 'open' },
      limit: 20,
      pages: 1,
    });
    expect(request.counts.map((count) => count.id)).toEqual([
      'not_analysed',
      'archived',
      'spam',
      '__board',
    ]);
    expect(request.counts[0].filters).toEqual({ view: 'not_analysed', read: 'unread' });
    expect(request.counts[3].filters).toEqual({ view: 'board', scope: '1' });

    // What came back is what the board shows: each column's own total, the unread sum.
    expect(await screen.findByText('11')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(getThreads).not.toHaveBeenCalled();
  });

  it('a refresh is one more request, keeps the pages open, and does not re-ask the scope', async () => {
    const view = render(renderBoard(0));
    await screen.findByText('11');
    view.rerender(renderBoard(1));
    await waitFor(() => expect(getThreadBoard).toHaveBeenCalledTimes(2));
    const [refresh] = getThreadBoard.mock.calls[1];
    expect(refresh.columns).toHaveLength(5);
    expect(refresh.counts.map((count) => count.id)).not.toContain('__board');
    // CONTROL: the unread counts are still asked on a refresh.
    expect(refresh.counts.map((count) => count.id)).toContain('spam');
    expect(getThreads).not.toHaveBeenCalled();
  });

  it('keeps a column as it was when its entry failed, and fills the others', async () => {
    getThreadBoard.mockImplementation((request) => {
      const answer = boardAnswer(request);
      return Promise.resolve({ ...answer, columns: { ...answer.columns, open: null } });
    });
    render(renderBoard(0));
    expect(await screen.findByText('12')).toBeInTheDocument();
    expect(screen.queryByText('11')).not.toBeInTheDocument();
    expect(getThreads).not.toHaveBeenCalled();
  });

  it('a column deeper than the board read takes is read on its own; the rest stays one request', async () => {
    getThreads.mockImplementation((_filters, pageNo = 1) =>
      Promise.resolve({
        success: true,
        data: [{ threadId: `deep-${pageNo}`, latestMessage: { id: 1 } }],
        pagination: { page: pageNo, limit: 20, total: 1000, totalPages: 50 },
      } as never)
    );
    const view = render(renderBoard(0));
    await screen.findByText('11');
    // "Load more" on Open ten times: 11 pages, one past what the board read takes.
    for (let clicks = 0; clicks < 10; clicks += 1) {
      const before = getThreads.mock.calls.length;
      fireEvent.click(screen.getAllByRole('button', { name: /load more/i })[0]);
      await waitFor(() => expect(getThreads.mock.calls.length).toBe(before + 1));
    }
    getThreads.mockClear();
    view.rerender(renderBoard(1));
    await waitFor(() => expect(getThreadBoard).toHaveBeenCalledTimes(2));
    const [refresh] = getThreadBoard.mock.calls[1];
    expect(refresh.columns.map((col) => col.id)).not.toContain('open');
    // CONTROL: the other columns are still in the one request.
    expect(refresh.columns.map((col) => col.id)).toContain('in_progress');
    // Open re-reads its own 11 pages, as before the board read existed.
    await waitFor(() => expect(getThreads).toHaveBeenCalledTimes(11));
  });

  it('CONTROL: a backend without the route is read one search per column, as before', async () => {
    getThreadBoard.mockResolvedValue(null);
    render(renderBoard(0));
    // 5 columns + 3 unread counts + the scope.
    await waitFor(() => expect(getThreads).toHaveBeenCalledTimes(9));
  });
});
