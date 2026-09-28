/**
 * On the board a shift-click ranges over ONE column, in the order that column draws its cards
 * (owner, 2026-09-28: "in Kanban the range stays within a column"). Columns sort independently,
 * so "between" two cards in different lanes has no single meaning.
 *
 * Also: select mode reaches every card, and a plain click stays a plain toggle.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, within, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { defaultFilters } from '@/stores/messagesStore';
import { messageService, type MessageThread } from '@/services/message.service';
import { MessagesKanbanView } from '../MessagesKanbanView';

vi.mock('@/services/message.service', () => ({
  messageService: { getThreads: vi.fn(), classify: vi.fn(), reopen: vi.fn() },
}));
vi.mock('@/hooks/useDepartmentContextKey', () => ({ useDepartmentContextKey: () => 'dept' }));
vi.mock('@/hooks/useNotificationCounts', () => ({
  useNotificationCounts: () => ({ counts: {}, clearKind: vi.fn() }),
}));
vi.mock('@/components/ui/ReactSelect', () => ({ ReactSelect: () => null }));
vi.mock('../KanbanCard', () => ({
  KanbanCard: ({
    thread,
    onToggleSelected,
    selectMode,
  }: {
    thread: MessageThread;
    onToggleSelected?: (id: number, options?: { range: true }) => void;
    selectMode?: boolean;
  }) => (
    <div data-testid="card" data-id={thread.latestMessage?.id} data-mode={String(selectMode)}>
      <button type="button" onClick={() => onToggleSelected?.(thread.latestMessage!.id)}>
        plain
      </button>
      <button
        type="button"
        onClick={() => onToggleSelected?.(thread.latestMessage!.id, { range: true })}
      >
        shift
      </button>
    </div>
  ),
}));

const getThreads = vi.mocked(messageService.getThreads);

beforeEach(() => {
  getThreads.mockReset();
  // Every lane gets its own ids (by call order), so a range that leaked across lanes would
  // carry ids from another lane.
  let lane = 0;
  getThreads.mockImplementation(() => {
    lane += 1;
    const base = lane * 100;
    const rows = [3, 1, 2].map((offset) => ({
      threadId: `t${base + offset}`,
      sender: 's',
      latestMessage: { id: base + offset },
    }));
    return Promise.resolve({
      success: true,
      data: rows,
      pagination: { page: 1, limit: 20, total: 3, totalPages: 1 },
    } as never);
  });
});

const renderBoard = (props: Record<string, unknown>) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MessagesKanbanView
        filters={defaultFilters}
        onOpen={() => {}}
        refreshKey={0}
        onScopeJump={() => {}}
        isSelected={() => false}
        {...props}
      />
    </QueryClientProvider>
  );

const openColumn = () => document.querySelector('[data-column="open"]') as HTMLElement;

describe('Kanban shift-click range', () => {
  it('passes the CLICKED column’s cards, in drawn order, as the range', async () => {
    const onToggleSelected = vi.fn();
    const onToggleRange = vi.fn();
    renderBoard({ onToggleSelected, onToggleRange, selectMode: true });
    await waitFor(() => expect(within(openColumn()).getAllByTestId('card')).toHaveLength(3));

    const cards = within(openColumn()).getAllByTestId('card');
    const drawn = cards.map((card) => Number(card.getAttribute('data-id')));
    fireEvent.click(within(cards[2]).getByRole('button', { name: 'shift' }));

    expect(onToggleRange).toHaveBeenCalledTimes(1);
    expect(onToggleRange).toHaveBeenCalledWith(drawn[2], drawn);
    expect(onToggleSelected).not.toHaveBeenCalled();
  });

  it('a plain click is a plain toggle', async () => {
    const onToggleSelected = vi.fn();
    const onToggleRange = vi.fn();
    renderBoard({ onToggleSelected, onToggleRange });
    await waitFor(() => expect(within(openColumn()).getAllByTestId('card')).toHaveLength(3));

    const first = within(openColumn()).getAllByTestId('card')[0];
    fireEvent.click(within(first).getByRole('button', { name: 'plain' }));

    expect(onToggleSelected).toHaveBeenCalledWith(Number(first.getAttribute('data-id')));
    expect(onToggleRange).not.toHaveBeenCalled();
  });

  it('select mode reaches every card on the board', async () => {
    renderBoard({ onToggleSelected: vi.fn(), onToggleRange: vi.fn(), selectMode: true });
    await waitFor(() => expect(within(openColumn()).getAllByTestId('card')).toHaveLength(3));
    const modes = [...document.querySelectorAll('[data-testid="card"]')].map((card) =>
      card.getAttribute('data-mode')
    );
    expect(modes.length).toBeGreaterThan(3);
    expect(new Set(modes)).toEqual(new Set(['true']));
  });
});
