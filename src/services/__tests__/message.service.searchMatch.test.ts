import { describe, expect, it } from 'vitest';
import { normalizeSearchMatch } from '../message.service';

describe('normalizeSearchMatch', () => {
  it('keeps a body match with its snippet', () => {
    expect(normalizeSearchMatch({ field: 'body', snippet: 'the parcel arrived' })).toEqual({
      field: 'body',
      snippet: 'the parcel arrived',
    });
  });

  it('keeps a note match with its snippet', () => {
    expect(normalizeSearchMatch({ field: 'note', snippet: 'called back' })).toEqual({
      field: 'note',
      snippet: 'called back',
    });
  });

  it('keeps a field match without a snippet, and drops a blank one', () => {
    expect(normalizeSearchMatch({ field: 'subject' })).toEqual({ field: 'subject' });
    expect(normalizeSearchMatch({ field: 'body', snippet: '  ' })).toEqual({ field: 'body' });
  });

  it('reads an older backend (absent), no search (null) and junk as null', () => {
    expect(normalizeSearchMatch(undefined)).toBeNull();
    expect(normalizeSearchMatch(null)).toBeNull();
    expect(normalizeSearchMatch({ field: 'elsewhere' })).toBeNull();
    expect(normalizeSearchMatch('body')).toBeNull();
    expect(normalizeSearchMatch({ field: 'body', snippet: 42 })).toEqual({ field: 'body' });
  });
});
