/**
 * Recent searches in the filter bar: offered when it opens empty, picking one runs it again,
 * and only a SETTLED search is recorded — never each pause of a live search on the way.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, render, screen, cleanup, fireEvent } from '@testing-library/react';
import { FilterTokenBar, LIVE_SEARCH_DELAY_MS } from '../FilterTokenBar';
import { buildFilterDefs, EMPTY_DYNAMIC_OPTIONS } from '../filterSchema';
import type { RecentSearch } from '@/services/recentSearch.service';
import type { FilterState } from '@/stores/messagesStore';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const recent: RecentSearch[] = [
  { id: 2, query: 'refund lowtide', lastUsedAt: '2026-10-22T08:00:00Z' },
  { id: 1, query: 'john smith', lastUsedAt: '2026-10-21T08:00:00Z' },
];

const setup = () => {
  const props = {
    onCommitSearch: vi.fn(),
    onSearchSettled: vi.fn(),
    onRemoveRecent: vi.fn(),
    onClearRecent: vi.fn(),
    onSaveSearchAsView: vi.fn(),
  };
  render(
    <FilterTokenBar
      defs={buildFilterDefs(EMPTY_DYNAMIC_OPTIONS)}
      filters={{} as FilterState}
      isKanban={false}
      onFilterChange={vi.fn()}
      onFilterPatch={vi.fn()}
      recent={recent}
      {...props}
    />
  );
  const input = screen.getByLabelText(/filter or search/i);
  fireEvent.mouseDown(input);
  const type = (value: string) => fireEvent.change(input, { target: { value } });
  const pause = () => {
    act(() => {
      vi.advanceTimersByTime(LIVE_SEARCH_DELAY_MS);
    });
  };
  return { input, type, pause, ...props };
};

describe('FilterTokenBar recent searches', () => {
  it('lists recent searches, newest first, when the bar opens empty', () => {
    setup();
    const list = screen.getByRole('region', { name: 'Recent searches' });
    expect(list.textContent).toMatch(/refund lowtide.*john smith/);
  });

  it('hides them once something is typed — the menu is then about that text', () => {
    const { type } = setup();
    type('inv');
    expect(screen.queryByRole('region', { name: 'Recent searches' })).toBeNull();
  });

  it('picking one runs the search again and moves it to the top', () => {
    const { onCommitSearch, onSearchSettled } = setup();
    fireEvent.click(screen.getByText('john smith'));
    expect(onCommitSearch).toHaveBeenCalledWith('john smith');
    expect(onSearchSettled).toHaveBeenCalledWith('john smith');
  });

  it('removes one, clears all, saves one as a view', () => {
    const { onRemoveRecent, onClearRecent, onSaveSearchAsView } = setup();
    fireEvent.click(screen.getByLabelText('Remove “john smith” from recent searches'));
    expect(onRemoveRecent).toHaveBeenCalledWith(recent[1]);
    fireEvent.click(screen.getByLabelText('Save “refund lowtide” as a view'));
    expect(onSaveSearchAsView).toHaveBeenCalledWith('refund lowtide');
    fireEvent.click(screen.getByText('Clear'));
    expect(onClearRecent).toHaveBeenCalled();
  });

  it('records a live search once the person clicks away from it — not each pause on the way', () => {
    const { type, pause, onCommitSearch, onSearchSettled } = setup();
    type('inv');
    pause();
    type('invoice');
    pause();
    // Control: the live searches ran…
    expect(onCommitSearch).toHaveBeenCalledWith('inv');
    expect(onCommitSearch).toHaveBeenCalledWith('invoice');
    // …and none of them was recorded yet.
    expect(onSearchSettled).not.toHaveBeenCalled();
    fireEvent.mouseDown(document.body);
    expect(onSearchSettled).toHaveBeenCalledTimes(1);
    expect(onSearchSettled).toHaveBeenCalledWith('invoice');
  });

  it('records a search confirmed with Enter exactly once', () => {
    const { input, type, pause, onSearchSettled } = setup();
    type('invoice');
    pause();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSearchSettled).toHaveBeenCalledTimes(1);
    expect(onSearchSettled).toHaveBeenCalledWith('invoice');
  });

  it('does not record a live search abandoned with Escape', () => {
    const { input, type, pause, onSearchSettled } = setup();
    type('invoice');
    pause();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onSearchSettled).not.toHaveBeenCalled();
  });
});
