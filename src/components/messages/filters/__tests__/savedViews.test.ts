/**
 * Saved views live in localStorage, which means the data can be anything — written by
 * an older build, hand-edited, or truncated. None of that may take the inbox down.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  BUILT_IN_VIEWS,
  loadSavedViews,
  persistSavedViews,
  viewIsActive,
} from '../savedViews';
import type { FilterState } from '@/stores/messagesStore';

const KEY = 'odly-inbox-saved-views';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('loadSavedViews — tolerates whatever is in storage', () => {
  it('returns [] when nothing has been saved', () => {
    expect(loadSavedViews()).toEqual([]);
  });

  it('returns [] rather than throwing on malformed JSON', () => {
    localStorage.setItem(KEY, '{not json');
    expect(loadSavedViews()).toEqual([]);
  });

  it('returns [] when the payload is not an array', () => {
    localStorage.setItem(KEY, '{"name":"Mine"}');
    expect(loadSavedViews()).toEqual([]);
  });

  it('keeps the well-formed entries and drops the rest', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify([
        { name: 'Good', filters: { priority: 'high' } },
        { name: 'No filters' },
        { filters: { priority: 'low' } },
        'nonsense',
      ])
    );
    expect(loadSavedViews().map((view) => view.name)).toEqual(['Good']);
  });
});

describe('persistSavedViews', () => {
  it('never writes the built-ins — they are code, not data', () => {
    persistSavedViews([...BUILT_IN_VIEWS, { name: 'Mine only', filters: { priority: 'high' } }]);
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '[]') as { name: string }[];
    expect(stored.map((view) => view.name)).toEqual(['Mine only']);
  });

  it('survives a storage failure without throwing', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => persistSavedViews([{ name: 'x', filters: {} }])).not.toThrow();
  });
});

describe('viewIsActive — exact, not a subset', () => {
  const inbox = BUILT_IN_VIEWS[0];

  it('lights up on exactly the view', () => {
    expect(viewIsActive(inbox, { lifecycle: 'open' } as FilterState, ['lifecycle'])).toBe(true);
  });

  it('does NOT light up when extra filters are piled on top', () => {
    // Looking at open threads assigned to me is a different thing from "Inbox", and a
    // pill claiming otherwise would misdescribe what is on screen.
    const filters = { lifecycle: 'open', priority: 'high' } as FilterState;
    expect(viewIsActive(inbox, filters, ['lifecycle', 'priority'])).toBe(false);
  });

  it('does not light up when the value differs', () => {
    expect(viewIsActive(inbox, { lifecycle: 'resolved' } as FilterState, ['lifecycle'])).toBe(
      false
    );
  });

  it('compares across types, since flags arrive as booleans', () => {
    const breached = BUILT_IN_VIEWS[3];
    expect(viewIsActive(breached, { slaBreached: true } as FilterState, ['slaBreached'])).toBe(
      true
    );
  });
});
