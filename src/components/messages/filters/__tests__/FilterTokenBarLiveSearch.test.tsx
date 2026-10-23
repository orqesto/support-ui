/**
 * Search as you type: a pause after typing runs the search without Enter; short text waits;
 * typing that turns out to be a filter, or is abandoned, puts the earlier search back.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, render, screen, cleanup, fireEvent } from '@testing-library/react';
import { FilterTokenBar, LIVE_SEARCH_DELAY_MS } from '../FilterTokenBar';
import { buildFilterDefs, EMPTY_DYNAMIC_OPTIONS } from '../filterSchema';
import type { FilterState } from '@/stores/messagesStore';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const defs = buildFilterDefs(EMPTY_DYNAMIC_OPTIONS);

const setup = (filters: FilterState = {} as FilterState, liveSearch = true) => {
  const onCommitSearch = vi.fn();
  const onFilterChange = vi.fn();
  render(
    <FilterTokenBar
      defs={defs}
      filters={filters}
      isKanban={false}
      onFilterChange={onFilterChange}
      onFilterPatch={vi.fn()}
      onCommitSearch={onCommitSearch}
      liveSearch={liveSearch}
    />
  );
  const input = screen.getByLabelText(/filter or search/i);
  fireEvent.mouseDown(input);
  const type = (value: string) => fireEvent.change(input, { target: { value } });
  const pause = () =>
    act(() => {
      vi.advanceTimersByTime(LIVE_SEARCH_DELAY_MS);
    });
  return { input, type, pause, onCommitSearch, onFilterChange };
};

describe('FilterTokenBar search as you type', () => {
  it('searches the typed text after a pause, without Enter', () => {
    const { type, pause, onCommitSearch } = setup();
    type('refund');
    // Control: nothing before the pause — one search per pause, not per keystroke.
    act(() => {
      vi.advanceTimersByTime(LIVE_SEARCH_DELAY_MS - 1);
    });
    expect(onCommitSearch).not.toHaveBeenCalled();
    pause();
    expect(onCommitSearch).toHaveBeenCalledWith('refund');
  });

  it('runs one search for a burst of keystrokes', () => {
    const { type, pause, onCommitSearch } = setup();
    type('ref');
    act(() => {
      vi.advanceTimersByTime(100);
    });
    type('refu');
    act(() => {
      vi.advanceTimersByTime(100);
    });
    type('refund');
    pause();
    expect(onCommitSearch).toHaveBeenCalledTimes(1);
    expect(onCommitSearch).toHaveBeenCalledWith('refund');
  });

  it('waits for Enter under three characters', () => {
    const { input, type, pause, onCommitSearch } = setup();
    type('re');
    pause();
    expect(onCommitSearch).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommitSearch).toHaveBeenCalledWith('re');
  });

  it('Escape puts back the search that was there before typing', () => {
    const { input, type, pause, onCommitSearch } = setup({ search: 'earlier' } as FilterState);
    type('refund');
    pause();
    expect(onCommitSearch).toHaveBeenLastCalledWith('refund');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onCommitSearch).toHaveBeenLastCalledWith('earlier');
  });

  it('typing that ends in a filter pick puts back the earlier search', () => {
    const { type, pause, onCommitSearch, onFilterChange } = setup();
    type('spam');
    pause();
    expect(onCommitSearch).toHaveBeenLastCalledWith('spam');
    fireEvent.click(screen.getByText('Spam'));
    expect(onFilterChange).toHaveBeenCalledWith('queue', 'spam');
    expect(onCommitSearch).toHaveBeenLastCalledWith('');
  });

  it('erasing below three characters puts back the earlier search', () => {
    const { type, pause, onCommitSearch } = setup({ search: 'earlier' } as FilterState);
    type('refund');
    pause();
    type('re');
    pause();
    expect(onCommitSearch).toHaveBeenLastCalledWith('earlier');
  });

  it('CONTROL: a click away keeps the live search — it is usually a click on a result', () => {
    const { type, pause, onCommitSearch } = setup({ search: 'earlier' } as FilterState);
    type('refund');
    pause();
    fireEvent.mouseDown(document.body);
    expect(onCommitSearch).toHaveBeenLastCalledWith('refund');
    expect(onCommitSearch).toHaveBeenCalledTimes(1);
  });

  it('a click away searches what was TYPED, not the prefix of the last pause', () => {
    const { type, pause, onCommitSearch } = setup();
    type('invo');
    pause();
    type('invoice'); // no pause before the click
    fireEvent.mouseDown(document.body);
    expect(onCommitSearch).toHaveBeenLastCalledWith('invoice');
  });

  it('a click away after erasing below three characters puts back the earlier search', () => {
    const { type, pause, onCommitSearch } = setup({ search: 'earlier' } as FilterState);
    type('refund');
    pause();
    type('re');
    fireEvent.mouseDown(document.body);
    expect(onCommitSearch).toHaveBeenLastCalledWith('earlier');
  });

  it('with live search off (board, contacts) only Enter searches', () => {
    const { input, type, pause, onCommitSearch } = setup({} as FilterState, false);
    type('refund');
    pause();
    fireEvent.mouseDown(document.body);
    expect(onCommitSearch).not.toHaveBeenCalled();
    // CONTROL: Enter still does.
    fireEvent.mouseDown(input);
    type('refund');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommitSearch).toHaveBeenCalledWith('refund');
  });

  it('the Enter that confirms a Japanese or Chinese composition does not search', () => {
    const { input, type, onCommitSearch } = setup({} as FilterState, false);
    type('ちゅうもん');
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
    expect(onCommitSearch).not.toHaveBeenCalled();
    // CONTROL: the next, plain Enter searches.
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommitSearch).toHaveBeenCalledTimes(1);
  });
});
