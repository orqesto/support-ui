/**
 * Mutation batch (message detail v4), chunk 7: contactLookupKey with no sender at all answers
 * nothing — `sender.match` without the `?.` would throw on the first contact tab of a thread
 * whose sender is unknown.
 */
import { describe, it, expect } from 'vitest';
import { contactLookupKey } from '@/lib/messageHelpers';

describe('contactLookupKey', () => {
  it('an address wins; a chat handle keeps the first <…>; nothing is nothing', () => {
    expect(contactLookupKey('"Smith <Sales>" <s@x.com>')).toBe('s@x.com');
    expect(contactLookupKey('Ada <@ada_handle>')).toBe('@ada_handle');
    expect(contactLookupKey('+15551234')).toBe('+15551234');
    expect(contactLookupKey(undefined)).toBe('');
    expect(contactLookupKey(null)).toBe('');
  });
});
