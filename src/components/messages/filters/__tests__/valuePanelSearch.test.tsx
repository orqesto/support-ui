/**
 * A value list long enough to hide things must be searchable.
 *
 * Measured on a live workspace 2026-08-26: the "Delivered to" filter offered 99 addresses —
 * eleven belonging to the mailbox and eighty-eight customers who had once been cc'd or
 * replied to — inside a 260px scroll window, alphabetical, with no search. Every alias
 * WAS there, so the filter was technically correct and practically unusable.
 *
 * Search appears only once a list has outgrown being scanned; below the threshold it is
 * clutter. And it must never be the reason an option cannot be reached, which is why the
 * needle resets when a different filter is opened.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { FilterTokenBar } from '../FilterTokenBar';
import { buildFilterDefs, EMPTY_DYNAMIC_OPTIONS } from '../filterSchema';
import type { FilterState } from '@/stores/messagesStore';

afterEach(cleanup);

const alias = (address: string, ours = false, hint?: string) => ({
  value: address,
  label: address,
  section: ours ? 'This mailbox' : 'Also seen',
  hint,
});

const MANY = [
  alias('info@coresarms.co.uk', true, '257 · confirmed'),
  alias('info@coresarms.de', true, '49 · confirmed'),
  ...Array.from({ length: 10 }, (_, index) => alias(`customer${index}@example.com`, false, '1')),
];

const open = (aliases = MANY) => {
  render(
    <FilterTokenBar
      defs={buildFilterDefs({ ...EMPTY_DYNAMIC_OPTIONS, aliases })}
      filters={{} as FilterState}
      isKanban={false}
      onFilterChange={vi.fn()}
      onFilterPatch={vi.fn()}
      onCommitSearch={vi.fn()}
    />
  );
  fireEvent.mouseDown(screen.getByLabelText(/filter or search/i));
  fireEvent.click(screen.getByText('Delivered to'));
};

describe('value panel search', () => {
  it('offers a search box once the list has outgrown scanning', () => {
    open();
    expect(screen.getByLabelText('Search Delivered to')).toBeTruthy();
  });

  it('narrows the list to what was typed', () => {
    open();
    fireEvent.change(screen.getByLabelText('Search Delivered to'), { target: { value: 'coresarms' } });
    expect(screen.getByText('info@coresarms.co.uk')).toBeTruthy();
    expect(screen.queryByText('customer0@example.com')).toBeNull();
  });

  it('matches the middle of an address, not only its start', () => {
    // Someone hunting an alias types the domain, not the local part.
    open();
    fireEvent.change(screen.getByLabelText('Search Delivered to'), { target: { value: '.de' } });
    expect(screen.getByText('info@coresarms.de')).toBeTruthy();
    expect(screen.queryByText('info@coresarms.co.uk')).toBeNull();
  });

  it('says so when nothing matches, rather than showing an empty panel', () => {
    open();
    fireEvent.change(screen.getByLabelText('Search Delivered to'), { target: { value: 'zzzz' } });
    expect(screen.getByText(/No address matches/i)).toBeTruthy();
  });

  it('shows the provenance hint beside the address', () => {
    // "257 · confirmed" is our own server's record of accepting the mail; a bare count is
    // the sender's claim. The distinction is the whole reason the hint exists.
    open();
    expect(screen.getByText('257 · confirmed')).toBeTruthy();
  });

  it('does NOT offer search on a short list', () => {
    open([alias('info@coresarms.co.uk', true), alias('info@coresarms.de', true)]);
    expect(screen.queryByLabelText('Search Delivered to')).toBeNull();
  });
});
