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
import { describe, it, expect, afterAll, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { FilterState } from '@/features/messages/stores/messagesStore';

// The bar's data (filter options, lead visibility, saved views, recent searches) is not under test. Left real,
// those queries went out as jsdom XHRs to a dead port and failed AFTER the file ended; under a
// loaded full run the late console.log raised "EnvironmentTeardownError: Closing rpc while
// onUserConsoleLog was pending" and the suite exited 1 with every test green.
vi.mock('../useFilterOptions', () => ({
  useFilterOptions: () => ({
    assignees: [],
    departments: [],
    sources: [],
    labels: [],
    aliases: [],
  }),
}));
vi.mock('@/features/messages/hooks/useLeadsHidden', () => ({ useLeadsHidden: () => false }));
vi.mock('@/features/messages/services/savedView.service', () => ({
  savedViewService: {
    list: vi.fn(() => Promise.resolve([])),
    save: vi.fn(),
    remove: vi.fn(),
    rename: vi.fn(),
  },
}));

vi.mock('@/features/messages/services/recentSearch.service', () => ({
  recentSearchService: { list: vi.fn(() => Promise.resolve([])), save: vi.fn(), remove: vi.fn() },
}));

const { MessageFilterBar } = await import('../MessageFilterBar');

// Guard: nothing in this file may reach the network, so nothing can still be pending at teardown.
const requested: string[] = [];
// eslint-disable-next-line @typescript-eslint/unbound-method -- restored as-is in afterAll, called via apply
const realOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, ...args: unknown[]) {
  requested.push(String(args[1]));
  return (realOpen as (...openArgs: unknown[]) => void).apply(this, args);
} as typeof realOpen;
beforeEach(() => {
  requested.length = 0;
});
afterEach(() => {
  cleanup();
  expect(requested).toEqual([]);
});
afterAll(() => {
  XMLHttpRequest.prototype.open = realOpen;
});

// The bar loads department/source options through react-query; it needs a client even
// though none of these assertions touch them.
const withClient = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
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
      <MessageFilterBar
        {...props}
        pagination={{ page: 1, limit: 50, total: 53 }}
        isKanban={false}
      />
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
    expect(screen.getByText('No threads')).toBeTruthy();
    unmount();

    withClient(
      <MessageFilterBar {...props} pagination={{ page: 1, limit: 0, total: 0 }} isKanban />
    );
    expect(screen.getByText('No threads')).toBeTruthy();
  });
});
