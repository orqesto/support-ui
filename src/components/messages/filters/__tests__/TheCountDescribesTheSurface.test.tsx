/**
 * The count in the header must belong to the surface you are looking at.
 *
 * Reported from a live inbox: "1–50 of 53" sitting above a Kanban board whose own badge
 * said 64. Neither number was wrong. The list sends `view=work_queue`, which pins
 * `status IN ACTIVE_STATUSES` — a set that omits `needs_routing` — while the board's Open
 * lane includes those 11 threads and displays them badged "Needs routing". 53 + 11 = 64.
 * Two counts on one screen, from two different questions, with nothing saying so.
 *
 * ⛔ And "1–50" is not merely wrong on the board, it is unanswerable: the columns page
 * INDEPENDENTLY, 20 at a time each, so there is no single range to be in. Correcting the
 * total without dropping the range would have kept half the lie.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MessageFilterBar } from '../MessageFilterBar';
import type { FilterState } from '@/stores/messagesStore';

vi.mock('@/hooks/useSavedViews', () => ({
  useSavedViews: () => ({ userViews: [], saveView: vi.fn(), removeView: vi.fn(), viewSource: 'server' }),
}));

afterEach(cleanup);

// The bar loads department/source options through react-query; it needs a client even
// though none of these assertions touch them.
const withClient = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {ui}
    </QueryClientProvider>
  );

const props = {
  filters: { status: 'all' } as FilterState,
  activeFilterCount: 0,
  clearableFilterCount: 0,
  onFilterChange: vi.fn(),
  onFilterPatch: vi.fn(),
  onCommitSearch: vi.fn(),
  onClearFilters: vi.fn(),
};

describe('the header count', () => {
  it('reports a RANGE on the list, where paging is linear', () => {
    withClient(
      <MessageFilterBar {...props} pagination={{ page: 1, limit: 50, total: 53 }} isKanban={false} />
    );

    expect(screen.getByText('1–50')).toBeTruthy();
    expect(screen.getByText(/of 53/)).toBeTruthy();
  });

  it('reports the BOARD total, with no range, on the kanban', () => {
    withClient(
      <MessageFilterBar {...props} pagination={{ page: 1, limit: 64, total: 64 }} isKanban />
    );

    expect(screen.getByText('64')).toBeTruthy();
    expect(screen.getByText(/on this board/)).toBeTruthy();
    // The half that cannot be corrected, only dropped: the columns page independently.
    expect(screen.queryByText(/1–/)).toBeNull();
  });

  it('CONTROL: an empty surface still says so on both', () => {
    const { unmount } = withClient(
      <MessageFilterBar {...props} pagination={{ page: 1, limit: 50, total: 0 }} isKanban={false} />
    );
    expect(screen.getByText('No messages')).toBeTruthy();
    unmount();

    withClient(<MessageFilterBar {...props} pagination={{ page: 1, limit: 0, total: 0 }} isKanban />);
    expect(screen.getByText('No messages')).toBeTruthy();
  });
});
