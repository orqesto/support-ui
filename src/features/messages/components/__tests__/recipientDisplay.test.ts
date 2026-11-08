import { describe, it, expect } from 'vitest';
import { parseRecipients } from '../ReceivedAtAddresses';
import {
  draftToRecipients,
  invalidAddresses,
  looksLikeAddress,
  parseTypedAddresses,
} from '../RecipientFields';

/**
 * The frontend ships from `main` on merge while the backend ships on its own
 * cadence, so `recipients` is simply absent from live payloads until the backend
 * catches up. Reaching into `.to` during that gap is what white-screens a page —
 * hence a parser that returns one null for absent, malformed and empty alike.
 */
describe('parseRecipients', () => {
  it('returns null for a payload that predates the field', () => {
    expect(parseRecipients(undefined)).toBeNull();
    expect(parseRecipients(null)).toBeNull();
  });

  it('returns null for shapes the backend never sends', () => {
    expect(parseRecipients('info@acme.com')).toBeNull();
    expect(parseRecipients(['info@acme.com'])).toBeNull();
    expect(parseRecipients({ to: 'info@acme.com' })).toBeNull();
  });

  it('returns null when every list is empty', () => {
    // "We don't know who this was sent to" must not render as an empty
    // address line, which reads as "sent to nobody".
    expect(parseRecipients({ to: [], cc: [], bcc: [] })).toBeNull();
  });

  it('reads a well-formed value and drops non-string entries', () => {
    expect(parseRecipients({ to: ['info@acme.com', 7], cc: null, bcc: ['x@acme.com'] })).toEqual({
      to: ['info@acme.com'],
      cc: [],
      bcc: ['x@acme.com'],
    });
  });
});

describe('parseTypedAddresses', () => {
  it('accepts commas, semicolons and whitespace as separators', () => {
    expect(parseTypedAddresses('a@x.com, b@x.com;c@x.com  d@x.com')).toEqual([
      'a@x.com',
      'b@x.com',
      'c@x.com',
      'd@x.com',
    ]);
  });

  it('is empty for an untouched field', () => {
    expect(parseTypedAddresses('')).toEqual([]);
    expect(parseTypedAddresses('   ')).toEqual([]);
  });
});

describe('draftToRecipients', () => {
  it('omits a field the agent left alone rather than sending an empty list', () => {
    // An absent `to` is what the backend reads as "the requester and nobody
    // else". `[]` would be a different, meaningless statement.
    const result = draftToRecipients({ to: '', cc: '', bcc: '' });
    expect(result).toEqual({});
  });

  it('carries each list the agent filled in', () => {
    expect(draftToRecipients({ to: 'a@x.com', cc: 'c@x.com, d@x.com', bcc: '' })).toEqual({
      to: ['a@x.com'],
      cc: ['c@x.com', 'd@x.com'],
    });
  });
});

describe('address validation', () => {
  it('is permissive — the server is the authority', () => {
    // A strict regex here would reject addresses the server accepts. Note the
    // field is whitespace-separated, so an address containing a space cannot
    // reach this check at all — parseTypedAddresses would already have split it.
    expect(looksLikeAddress('x@y')).toBe(true);
    expect(looksLikeAddress('first.last+tag@mail.sub.example.museum')).toBe(true);
  });

  it('catches the typo it exists for', () => {
    expect(looksLikeAddress('not-an-address')).toBe(false);
    expect(invalidAddresses({ to: 'a@x.com, oops', cc: '', bcc: 'also-bad' })).toEqual([
      'oops',
      'also-bad',
    ]);
  });
});
