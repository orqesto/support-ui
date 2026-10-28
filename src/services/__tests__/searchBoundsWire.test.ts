/** The list's bounds on the wire (backend search plan step 3½), tolerated on an older backend. */
import { describe, expect, it } from 'vitest';
import { formatTotal, normalizeSearchReading } from '../message.service';

describe('search bounds on the wire', () => {
  it('reads `timedOut` from the search reading', () => {
    expect(
      normalizeSearchReading({ terms: ['the'], asPhrase: false, cutShort: [], timedOut: true })
        ?.timedOut
    ).toBe(true);
  });

  it('CONTROL: an older backend without the field reads as not timed out', () => {
    expect(
      normalizeSearchReading({ terms: ['the'], asPhrase: false, cutShort: [] })?.timedOut
    ).toBe(false);
  });

  it('a lower-bound total is shown with a plus, an exact one without', () => {
    expect(formatTotal(10_000, true)).toBe(`${(10_000).toLocaleString()}+`);
    expect(formatTotal(7, false)).toBe('7');
    expect(formatTotal(7)).toBe('7');
  });
});
