/**
 * The three things the token bar could not express until the query could: several values
 * at once, "is not", and a real date window.
 *
 * These assert the WRITES the bar makes, not the markup around them — the API contract is
 * `priority=high,critical`, `negate=lifecycle` and a pair of ISO instants, and a control
 * that renders beautifully while sending the wrong shape is the failure worth catching.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { FilterTokenBar } from '../FilterTokenBar';
import {
  NEGATABLE_KEYS,
  buildFilterDefs,
  csvValues,
  isNegated,
  toggleCsvValue,
  withNegation,
  EMPTY_DYNAMIC_OPTIONS,
} from '../filterSchema';
import { clearPatch, tokenText, tokensOf } from '../filterTokens';
import { startOfDayIso } from '../receivedRange';
import type { FilterState } from '@/stores/messagesStore';

afterEach(cleanup);

const defs = buildFilterDefs({
  ...EMPTY_DYNAMIC_OPTIONS,
  labels: [
    { value: '4', label: 'VIP', dot: '#a855f7' },
    { value: '7', label: 'Refund' },
  ],
});

const setup = (filters: FilterState = {} as FilterState) => {
  const onFilterChange = vi.fn();
  const onFilterPatch = vi.fn();
  render(
    <FilterTokenBar
      defs={defs}
      filters={filters}
      isKanban={false}
      onFilterChange={onFilterChange}
      onFilterPatch={onFilterPatch}
      onCommitSearch={vi.fn()}
    />
  );
  return {
    onFilterChange,
    onFilterPatch,
    input: screen.getByLabelText(/filter or search/i),
  };
};

// ── multi-value ─────────────────────────────────────────────────────────────

describe('several values at once', () => {
  it('adds to the set rather than replacing it', () => {
    // The behaviour change: picking Critical while High is on used to mean "Critical
    // instead", because the query could only hold one.
    expect(toggleCsvValue('high', 'critical')).toBe('high,critical');
  });

  it('a second pick on the same value takes it back out', () => {
    expect(toggleCsvValue('high,critical', 'high')).toBe('critical');
  });

  it('clears to "all" when the last value is removed — not to an empty string', () => {
    // `''` and `'all'` both read as off, but only `'all'` is what every other filter
    // sends, and the URL layer drops the param on `'all'` alone.
    expect(toggleCsvValue('high', 'high')).toBe('all');
  });

  it('reads "all" and "" as no values at all', () => {
    expect(csvValues('all')).toEqual([]);
    expect(csvValues('')).toEqual([]);
    expect(csvValues(undefined)).toEqual([]);
  });

  it('sends the CSV the API turns into an IN (…)', () => {
    const { onFilterChange, input } = setup({ priority: 'high' } as FilterState);
    fireEvent.mouseDown(input);
    fireEvent.click(screen.getByTitle('Critical'));
    expect(onFilterChange).toHaveBeenCalledWith('priority', 'high,critical');
  });

  it('keeps the menu open so the next value is one click away', () => {
    const { input } = setup({} as FilterState);
    fireEvent.mouseDown(input);
    fireEvent.click(screen.getByText('Label'));
    fireEvent.click(screen.getByText('VIP'));
    // Still in the Label panel — a multi that closes after each pick is four reopens
    // for four values.
    expect(screen.getByText('Refund')).toBeTruthy();
  });

  it('names two and counts the rest', () => {
    const priority = defs.find((def) => def.key === 'priority');
    expect(priority && tokenText(priority, 'high,critical', {} as FilterState)).toBe(
      'High, Critical'
    );
    expect(priority && tokenText(priority, 'low,medium,high', {} as FilterState)).toBe('Low +2');
  });

  it('drops the colour dot once there is more than one value', () => {
    const one = tokensOf(defs, { labelId: '4' } as FilterState, false);
    const two = tokensOf(defs, { labelId: '4,7' } as FilterState, false);
    expect(one[0].dot).toBe('#a855f7');
    expect(two[0].dot).toBeUndefined();
  });
});

// ── negation ────────────────────────────────────────────────────────────────

describe('is / is not', () => {
  it('only offers it for the filters the API can actually invert', () => {
    // The API drops an unknown name from `negate`, so a switch on any other filter
    // would be a control that visibly does nothing.
    const negatable = defs.filter((def) => def.negatable).map((def) => def.key);
    expect(negatable.sort()).toEqual([...NEGATABLE_KEYS].sort());
  });

  it('adds and removes one name without disturbing the others', () => {
    const filters = { negate: 'lifecycle,aiState' } as FilterState;
    expect(withNegation(filters, 'queue', true)).toBe('lifecycle,aiState,queue');
    expect(withNegation(filters, 'lifecycle', false)).toBe('aiState');
  });

  it('never doubles a name that is already there', () => {
    expect(withNegation({ negate: 'queue' } as FilterState, 'queue', true)).toBe('queue');
  });

  it('empties to "" rather than "all" — it is a list of names, not a value', () => {
    expect(withNegation({ negate: 'queue' } as FilterState, 'queue', false)).toBe('');
  });

  it('inverts from the segmented track, without opening the panel', () => {
    const { onFilterChange, input } = setup({ lifecycle: 'resolved' } as FilterState);
    fireEvent.mouseDown(input);
    fireEvent.click(screen.getByTitle('Exclude this instead'));
    expect(onFilterChange).toHaveBeenCalledWith('negate', 'lifecycle');
  });

  it('inverts from the value panel too — same write, two routes', () => {
    const { onFilterChange } = setup({ lifecycle: 'resolved' } as FilterState);
    // The token's value half reopens that filter's picker in place.
    fireEvent.click(screen.getByLabelText('Change Status'));
    fireEvent.click(screen.getByText('is not'));
    expect(onFilterChange).toHaveBeenCalledWith('negate', 'lifecycle');
  });

  it('switches back off from the panel', () => {
    const { onFilterChange } = setup({
      lifecycle: 'resolved',
      negate: 'lifecycle',
    } as FilterState);
    fireEvent.click(screen.getByLabelText('Change Status'));
    fireEvent.click(screen.getByText('is'));
    expect(onFilterChange).toHaveBeenCalledWith('negate', '');
  });

  it('the token says so, because the two sets are opposites', () => {
    const token = tokensOf(
      defs,
      { lifecycle: 'resolved', negate: 'lifecycle' } as FilterState,
      false
    )[0];
    expect(token.negated).toBe(true);
  });

  it('takes the inversion away with the filter it inverted', () => {
    // A leftover `negate` entry is inert while the filter is off, and then silently
    // inverts it the next time it is set.
    const lifecycle = defs.find((def) => def.key === 'lifecycle');
    const filters = { lifecycle: 'resolved', negate: 'lifecycle,aiState' } as FilterState;
    expect(lifecycle && clearPatch(lifecycle, filters)).toEqual({
      lifecycle: 'all',
      negate: 'aiState',
    });
  });

  it('leaves an unrelated filter to clear as a single value', () => {
    const priority = defs.find((def) => def.key === 'priority');
    expect(priority && clearPatch(priority, {} as FilterState)).toEqual({ priority: 'all' });
  });

  it('is not offered before the filter has a value', () => {
    // "is not <nothing>" is not a set. The track's ≠ button appears only once set.
    const { input } = setup({} as FilterState);
    fireEvent.mouseDown(input);
    expect(screen.queryByTitle(/Exclude this instead/)).toBeNull();
  });
});

// ── the date range ──────────────────────────────────────────────────────────

describe('Received — a bucket or a window, never both', () => {
  const received = defs.find((def) => def.key === 'received');

  it('is one token over three fields', () => {
    const from = startOfDayIso('2026-08-01');
    const tokens = tokensOf(defs, { receivedFrom: from } as FilterState, false);
    expect(tokens.filter((token) => token.def.key === 'received')).toHaveLength(1);
  });

  it('shows the bucket when a bucket is what is set', () => {
    const tokens = tokensOf(defs, { ageRange: 'lt24h' } as FilterState, false);
    expect(tokens.find((token) => token.def.key === 'received')?.text).toBe('Last 24 hours');
  });

  it('picking a bucket drops any range — the API would have intersected them', () => {
    const { onFilterPatch, input } = setup({
      receivedFrom: startOfDayIso('2026-08-01'),
    } as FilterState);
    fireEvent.mouseDown(input);
    fireEvent.click(screen.getByText('Received'));
    fireEvent.click(screen.getByText('1–7 days'));
    // toStrictEqual, not toHaveBeenCalledWith: the latter treats a MISSING key and a key
    // set to undefined as the same, and "missing" is precisely the bug — the range would
    // survive the bucket and the two would intersect.
    expect(onFilterPatch.mock.calls[0][0]).toStrictEqual({
      ageRange: '1to7d',
      receivedFrom: undefined,
      receivedTo: undefined,
    });
  });

  it('picking a date drops the bucket, and sends an instant rather than a day', () => {
    const { onFilterPatch, input } = setup({ ageRange: 'lt24h' } as FilterState);
    fireEvent.mouseDown(input);
    fireEvent.click(screen.getByText('Received'));
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-08-01' } });
    expect(onFilterPatch.mock.calls[0][0]).toStrictEqual({
      ageRange: 'all',
      receivedFrom: startOfDayIso('2026-08-01'),
      receivedTo: undefined,
    });
  });

  it('clears all three when the token goes', () => {
    expect(received && clearPatch(received, {} as FilterState)).toStrictEqual({
      ageRange: 'all',
      receivedFrom: undefined,
      receivedTo: undefined,
    });
  });

  it('is not negatable — the API has no inversion for a range', () => {
    expect(received?.negatable).toBeFalsy();
    expect(isNegated({ negate: 'received' } as FilterState, 'ageRange')).toBe(false);
  });
});
