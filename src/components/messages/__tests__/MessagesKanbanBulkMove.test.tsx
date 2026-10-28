/**
 * A bulk resolve moves its cards when the agent confirms, not when the server answers. The run
 * could take minutes on a busy database (a customer's workspace, 2026-10-28) and the 60 cards sat
 * in their lanes the whole time — for good, when the request timed out.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, waitFor, within } from '@testing-library/react';
import { createRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { defaultFilters } from '@/stores/messagesStore';
import { messageService, type MessageThread } from '@/services/message.service';
import { MessagesKanbanView, type MessagesKanbanHandle } from '../MessagesKanbanView';

vi.mock('@/services/message.service', () => ({
  messageService: { getThreads: vi.fn(), classify: vi.fn(), reopen: vi.fn() },
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
const card = (id: number) =>
  ({ threadId: `conv_${id}`, latestMessage: { id } }) as unknown as MessageThread;

beforeEach(() => {
  // Resolved is hidden by default; show every lane so the landing card can be seen.
  localStorage.setItem('kanban_hidden_cols', '[]');
  getThreads.mockReset();
  getThreads.mockImplementation((filters, page = 1, limit = 20) => {
    const sent = (filters ?? {});
    // Three cards in Open, none elsewhere.
    const rows = sent.lifecycle === 'open' && limit !== 1 ? [card(1), card(2), card(3)] : [];
    return Promise.resolve({
      success: true,
      data: rows,
      pagination: { page, limit, total: rows.length, totalPages: 1 },
    } as never);
  });
});

const lane = (id: string) =>
  within(document.querySelector(`[data-column="${id}"]`) as HTMLElement)
    .queryAllByTestId('card')
    .map((node) => node.textContent);

describe('optimisticMoveMany', () => {
  it('moves the selected cards to Resolved at once, leaves the rest', async () => {
    const ref = createRef<MessagesKanbanHandle>();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MessagesKanbanView
          ref={ref}
          filters={defaultFilters}
          onOpen={() => {}}
          refreshKey={0}
          onScopeJump={() => {}}
        />
      </QueryClientProvider>
    );
    await waitFor(() => expect(lane('open')).toEqual(['conv_1', 'conv_2', 'conv_3']));
    act(() => ref.current?.optimisticMoveMany([1, 3], 'resolved'));
    expect(lane('open')).toEqual(['conv_2']);
    expect(lane('resolved')).toEqual(['conv_1', 'conv_3']);
    // Control: ids not on the board change nothing.
    act(() => ref.current?.optimisticMoveMany([99], 'resolved'));
    expect(lane('open')).toEqual(['conv_2']);
  });
});
