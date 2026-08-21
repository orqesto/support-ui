import { describe, it, expect } from 'vitest';
import { negateApiParam } from '../negateApiParam';

describe('negateApiParam', () => {
  it('sends the inversions whose filters are in play', () => {
    expect(negateApiParam('lifecycle,aiState', ['lifecycle', 'aiState'])).toBe(
      'lifecycle,aiState'
    );
  });

  it('drops an inversion for a filter this query does not carry', () => {
    // Set Status, invert it, then clear Status: the entry lingers in the store and would
    // otherwise ride along on every request, saying something the list is not doing.
    expect(negateApiParam('lifecycle,aiState', ['aiState'])).toBe('aiState');
  });

  it('sends nothing rather than an empty param', () => {
    expect(negateApiParam('lifecycle', [])).toBeUndefined();
    expect(negateApiParam('', ['lifecycle'])).toBeUndefined();
    expect(negateApiParam(undefined, ['lifecycle'])).toBeUndefined();
  });

  it('ignores whitespace and duplicates from a hand-edited URL', () => {
    expect(negateApiParam(' queue , queue ', ['queue'])).toBe('queue');
  });

  it('drops a name that is not a negatable filter at all', () => {
    expect(negateApiParam('priority', ['lifecycle', 'queue', 'aiState'])).toBeUndefined();
  });
});
