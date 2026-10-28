/** The backend's search reading is normalised in the service, so every caller gets one shape. */
import { describe, expect, it } from 'vitest';
import { normalizeSearchReading } from '../message.service';

describe('normalizeSearchReading', () => {
  it('passes a full reading through', () => {
    expect(
      normalizeSearchReading({ terms: ['nvoic'], asPhrase: false, cutShort: ['nvoic'] })
    ).toEqual({
      terms: ['nvoic'],
      asPhrase: false,
      cutShort: ['nvoic'],
      timedOut: false,
    });
  });

  it('reads a backend without cutShort as nothing cut short', () => {
    expect(normalizeSearchReading({ terms: ['a'], asPhrase: true })?.cutShort).toEqual([]);
  });

  it('reads a backend without the field, or a malformed one, as no reading', () => {
    expect(normalizeSearchReading(undefined)).toBeNull();
    expect(normalizeSearchReading({ terms: 'x', asPhrase: false })).toBeNull();
    expect(normalizeSearchReading({ terms: [], asPhrase: 'no' })).toBeNull();
  });

  it('drops non-string entries rather than rendering them', () => {
    expect(
      normalizeSearchReading({ terms: ['a', 1], asPhrase: false, cutShort: ['b', null, 42] })
    ).toEqual({ terms: ['a'], asPhrase: false, cutShort: ['b'], timedOut: false });
  });
});
