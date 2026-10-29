/**
 * The board's scope count (`view=board&scope=1`) is the heaviest read on the board — an aggregate
 * over the whole org. It answers "what does this FILTER leave out", so it re-reads when the scope
 * changes, not on every refresh (a customer's database, 2026-10: it was the top statement while
 * every socket event refreshed every open board).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { defaultFilters } from '@/stores/messagesStore';
import { messageService } from '@/services/message.service';
import { MessagesKanbanView } from '../MessagesKanbanView';

vi.mock('@/services/message.service', () => ({
  messageService: { getThreads: vi.fn(), getThreadBoard: vi.fn(), classify: vi.fn(), reopen: vi.fn() },
}));
vi.mock('@/hooks/useDepartmentContextKey', () => ({ useDepartmentContextKey: () => 'dept' }));
vi.mock('@/hooks/useNotificationCounts', () => ({
  NOTIFICATION_COUNTS_KEY: ['notification-counts'],
  useNotificationCounts: () => ({ counts: {}, clearKind: vi.fn() }),
}));
vi.mock('@/components/ui/Select', () => ({ Select: () => null }));
vi.mock('../KanbanCard', () => ({ KanbanCard: () => null }));

const getThreads = vi.mocked(messageService.getThreads);
const scopeCalls = () =>
  getThreads.mock.calls.filter(([filters]) => {
    const sent = (filters ?? {});
    return sent.view === 'board' && 'scope' in sent;
  }).length;
const columnCalls = () =>
  getThreads.mock.calls.filter(([filters]) => !('scope' in (filters ?? {}))).length;

beforeEach(() => {
  getThreads.mockReset();
  getThreads.mockImplementation((_filters, page = 1, limit = 20) =>
    Promise.resolve({
      success: true,
      data: [],
      pagination: { page, limit, total: 0, totalPages: 1 },
    } as never)
  );
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

describe('Board scope count', () => {
  it('is read once on load, NOT again on a refresh — while the columns are', async () => {
    const view = render(renderBoard(0));
    await waitFor(() => expect(scopeCalls()).toBe(1));
    const columnsBefore = columnCalls();

    view.rerender(renderBoard(1));
    // Control: the refresh did reach the board — its columns were re-read.
    await waitFor(() => expect(columnCalls()).toBeGreaterThan(columnsBefore));
    expect(scopeCalls()).toBe(1);
  });

  it('is read again when the filter changes', async () => {
    const view = render(renderBoard(0));
    await waitFor(() => expect(scopeCalls()).toBe(1));
    view.rerender(renderBoard(0, { ...defaultFilters, search: 'refund' } as never));
    await waitFor(() => expect(scopeCalls()).toBe(2));
  });

  it('a load cancelled before it answered is retried on the next refresh', async () => {
    // The first scope read never answers, so the refresh below cancels it in flight.
    const answer = getThreads.getMockImplementation();
    let held = false;
    getThreads.mockImplementation((filters, ...rest) => {
      if (!held && filters?.view === 'board') {
        held = true;
        return new Promise(() => {});
      }
      return answer!(filters, ...rest);
    });
    const view = render(renderBoard(0));
    await waitFor(() => expect(scopeCalls()).toBe(1));
    view.rerender(renderBoard(1));
    await waitFor(() => expect(scopeCalls()).toBe(2));
    view.rerender(renderBoard(2));
    await waitFor(() => expect(columnCalls()).toBeGreaterThan(0));
    // Landed once now, so a third refresh does not ask again.
    expect(scopeCalls()).toBe(2);
  });
});

/**
 * The Triage tab's columns are 4 full queries; while the Board tab is on screen nobody sees them.
 * They load when the tab opens, once per scope/refresh — the unread badge is still counted.
 */
describe('Board loads only the tab on screen', () => {
  const TRIAGE = (filters: unknown) => {
    const sent = (filters ?? {}) as Record<string, string>;
    return ['not_analysed', 'archived', 'no_lane'].includes(sent.view) || sent.showSpam === 'true';
  };
  // Column reads, not the unread badge's `limit=1` counts.
  const triageColumnCalls = () =>
    getThreads.mock.calls.filter(([filters, , limit]) => TRIAGE(filters) && limit !== 1).length;
  const triageUnreadCalls = () =>
    getThreads.mock.calls.filter(([filters, , limit]) => TRIAGE(filters) && limit === 1).length;

  it('the Board tab does not read the Triage columns; opening Triage does, once', async () => {
    const view = render(renderBoard(0));
    await waitFor(() => expect(scopeCalls()).toBe(1));
    expect(triageColumnCalls()).toBe(0);
    // Control: the badge's unread counts are still asked for.
    expect(triageUnreadCalls()).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /^Triage/ }));
    await waitFor(() => expect(triageColumnCalls()).toBe(4));

    // Back and forth with nothing changed: no second read.
    fireEvent.click(screen.getByRole('button', { name: /^Board/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Triage/ }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(triageColumnCalls()).toBe(4);

    // A refresh while on the Board leaves Triage stale → reopening it re-reads.
    fireEvent.click(screen.getByRole('button', { name: /^Board/ }));
    view.rerender(renderBoard(1));
    await waitFor(() => expect(columnCalls()).toBeGreaterThan(0));
    expect(triageColumnCalls()).toBe(4);
    fireEvent.click(screen.getByRole('button', { name: /^Triage/ }));
    await waitFor(() => expect(triageColumnCalls()).toBe(8));
  });
});
