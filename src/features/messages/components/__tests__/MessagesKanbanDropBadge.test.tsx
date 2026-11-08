/**
 * A drag on the Triage board that classifies a thread (onto Spam, or out to approve) changes the
 * Needs Routing / triage counts, so it refreshes the sidebar badge's own query at once instead of
 * waiting for the 60 s poll; one the server refuses changes nothing and leaves it.
 *
 * dnd-kit needs real pointer geometry, which jsdom has none of: the test takes the board's
 * onDragEnd from DndContext and calls it with the event a drop produces.
 */
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as DndKit from '@dnd-kit/core';
import { defaultFilters } from '@/stores/messagesStore';
import { messageService, type MessageThread } from '@/services/message.service';

const drag = vi.hoisted(() => ({ end: null as null | ((event: DndKit.DragEndEvent) => void) }));
vi.mock('@dnd-kit/core', async (importOriginal) => {
  const real = await importOriginal<typeof DndKit>();
  return {
    ...real,
    DndContext: ({
      children,
      onDragEnd,
    }: {
      children: ReactNode;
      onDragEnd: (event: DndKit.DragEndEvent) => void;
    }) => {
      drag.end = onDragEnd;
      return <>{children}</>;
    },
  };
});
vi.mock('@/services/message.service', () => ({
  messageService: {
    getThreads: vi.fn(),
    getThreadBoard: vi.fn(),
    classify: vi.fn(),
    reopen: vi.fn(),
  },
}));
vi.mock('@/hooks/useDepartmentContextKey', () => ({ useDepartmentContextKey: () => 'dept' }));
vi.mock('@/components/ui/Select', () => ({ Select: () => null }));
vi.mock('../KanbanCard', () => ({
  KanbanCard: ({ thread }: { thread: MessageThread }) => (
    <div data-testid="card">{thread.threadId}</div>
  ),
}));

const { MessagesKanbanView } = await import('../MessagesKanbanView');

const getThreads = vi.mocked(messageService.getThreads);
const classify = vi.mocked(messageService.classify);
let invalidate: MockInstance<QueryClient['invalidateQueries']>;

beforeEach(() => {
  drag.end = null;
  getThreads.mockReset();
  // One thread per column, named after the column's filter, so each column holds its own.
  getThreads.mockImplementation((filters) => {
    const scope =
      (filters as { view?: string; lifecycle?: string }).view ??
      (filters as { lifecycle?: string }).lifecycle ??
      'all';
    return Promise.resolve({
      success: true,
      data: [{ threadId: `t-${scope}`, sender: 'a@b.example', latestMessage: { id: 7 } }],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    } as never);
  });
  classify.mockReset().mockResolvedValue(undefined as never);
  invalidate = vi.spyOn(QueryClient.prototype, 'invalidateQueries');
});
afterEach(() => invalidate.mockRestore());

const renderBoard = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MessagesKanbanView
        filters={defaultFilters}
        onOpen={() => {}}
        refreshKey={0}
        onScopeJump={() => {}}
      />
    </QueryClientProvider>
  );

const drop = (threadId: string, fromColId: string, toColId: string) =>
  act(() => {
    drag.end?.({
      active: { id: threadId, data: { current: { colId: fromColId } } },
      over: { id: toColId },
    } as unknown as DndKit.DragEndEvent);
  });

const badgeRefreshes = () =>
  invalidate.mock.calls.filter(
    ([filters]) => JSON.stringify(filters?.queryKey) === '["notification-counts"]'
  ).length;

describe('Kanban drop → the sidebar badge', () => {
  it('a drop onto Spam classifies the thread and refreshes the badge', async () => {
    renderBoard();
    fireEvent.click(screen.getByRole('button', { name: /^Triage/ }));
    await waitFor(() => expect(screen.getByText('t-not_analysed')).toBeInTheDocument());
    drop('t-not_analysed', 'not_analysed', 'spam');
    await waitFor(() => expect(classify).toHaveBeenCalled());
    expect(classify.mock.calls[0][0]).toBe(7);
    expect(classify.mock.calls[0][1]).toBe('move_to_spam');
    await waitFor(() => expect(badgeRefreshes()).toBe(1));
  });

  it('control: a classification the server refuses leaves the badge', async () => {
    classify.mockRejectedValueOnce(new Error('refused'));
    renderBoard();
    fireEvent.click(screen.getByRole('button', { name: /^Triage/ }));
    await waitFor(() => expect(screen.getByText('t-not_analysed')).toBeInTheDocument());
    drop('t-not_analysed', 'not_analysed', 'spam');
    await waitFor(() => expect(classify).toHaveBeenCalled());
    expect(badgeRefreshes()).toBe(0);
  });
});
