/**
 * Every value a filter can be set to must survive a trip through the URL.
 *
 * The URL layer validates each param against its own hand-maintained whitelist and
 * silently drops anything unrecognised — no warning, no error, the filter simply is not
 * there. `VALID_LIFECYCLES` was missing 'open', which is the value the Status control
 * has always sent, so `?lifecycle=open` never survived a read. It went unnoticed for as
 * long as nothing depended on it; the saved views did, and all three broke at once.
 *
 * These assert the two lists agree, so the next value added to a filter cannot quietly
 * fail to round-trip.
 */
import { describe, it, expect } from 'vitest';
import {
  VALID_AI_STATES,
  VALID_LIFECYCLES,
  VALID_LINKED,
  VALID_PRIORITIES,
  VALID_QUEUES,
  VALID_READ,
  VALID_THREAD_STATUSES,
} from '@/hooks/useMessagesUrlSync';
import { buildFilterDefs, EMPTY_DYNAMIC_OPTIONS, type FilterKey } from '../filterSchema';
import { BUILT_IN_VIEWS } from '../savedViews';

const defs = buildFilterDefs(EMPTY_DYNAMIC_OPTIONS);
const optionsOf = (key: FilterKey) =>
  defs.find((def) => def.key === key)?.options?.map((option) => option.value) ?? [];

const CASES: [FilterKey, readonly string[]][] = [
  ['lifecycle', VALID_LIFECYCLES],
  ['threadStatus', VALID_THREAD_STATUSES],
  ['queue', VALID_QUEUES],
  ['read', VALID_READ],
  ['priority', VALID_PRIORITIES],
  ['aiState', VALID_AI_STATES],
  ['linked', VALID_LINKED],
];

describe('filter schema ↔ URL whitelist parity', () => {
  it.each(CASES)('every %s value survives the URL', (key, whitelist) => {
    const offered = optionsOf(key);
    expect(offered.length).toBeGreaterThan(0);
    const dropped = offered.filter((value) => !whitelist.includes(value));
    expect(dropped).toEqual([]);
  });

  it('lifecycle accepts "open" — the value the Status control actually sends', () => {
    // Named separately from the sweep above: this is the regression itself, and a
    // reader should not have to work out which row of the table it was.
    expect(VALID_LIFECYCLES).toContain('open');
  });
});

describe('built-in views only use values that round-trip', () => {
  it.each(BUILT_IN_VIEWS.map((view) => [view.name, view] as const))(
    '%s',
    (_name, view) => {
      for (const [key, value] of Object.entries(view.filters)) {
        if (typeof value !== 'string') continue; // flags are booleans, not enums
        const pair = CASES.find(([filterKey]) => filterKey === key);
        if (pair) expect(pair[1]).toContain(value);
      }
    }
  );
});
