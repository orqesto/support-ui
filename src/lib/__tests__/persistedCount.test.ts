/**
 * Seeding a nav-visibility count from the last known value.
 *
 * The sidebar renders before a count query resolves, so it has to assume something, and
 * both assumptions are visible: assuming "has items" made the Tickets link appear and then
 * vanish for orgs with none; assuming "none" makes it appear late for orgs that have them.
 * Because the count's queryKey carries org + department, that assumption was re-made on
 * every switch, not just on a cold load.
 *
 * These cover the read path specifically, because it decides what the user sees on the
 * first frame: anything other than a real non-negative number must come back `undefined`
 * so the caller falls back to "hidden" rather than rendering a link based on garbage.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readPersistedCount, writePersistedCount } from '../persistedCount';

describe('persistedCount', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips a count for a scope key', () => {
    writePersistedCount('tickets.20.all', 7);
    expect(readPersistedCount('tickets.20.all')).toBe(7);
  });

  it('keeps scopes independent so switching org or dept cannot read the wrong count', () => {
    writePersistedCount('tickets.20.all', 7);
    writePersistedCount('tickets.21.all', 0);
    expect(readPersistedCount('tickets.20.all')).toBe(7);
    expect(readPersistedCount('tickets.21.all')).toBe(0);
    expect(readPersistedCount('tickets.99.all')).toBeUndefined();
  });

  it('distinguishes a stored zero from a missing value', () => {
    // The whole point of the cache: 0 means "known to have none" (stay hidden, no flash),
    // undefined means "never asked" (also hidden, but the query will decide).
    writePersistedCount('tickets.20.all', 0);
    expect(readPersistedCount('tickets.20.all')).toBe(0);
    expect(readPersistedCount('tickets.20.dept-3')).toBeUndefined();
  });

  it('returns undefined for corrupt or hostile values rather than a wrong count', () => {
    for (const bad of ['', 'abc', 'NaN', '-1', 'Infinity', '{}']) {
      localStorage.setItem('odly.count.tickets.20.all', bad);
      expect(readPersistedCount('tickets.20.all')).toBeUndefined();
    }
  });

  it('namespaces its keys so it cannot collide with other localStorage users', () => {
    writePersistedCount('tickets.20.all', 4);
    expect(localStorage.getItem('odly.count.tickets.20.all')).toBe('4');
    expect(localStorage.getItem('tickets.20.all')).toBeNull();
  });
});
