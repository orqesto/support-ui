/**
 * isOutgoingEvent: the one reading of "ours, not the customer's" the thread bubble and the Files
 * row share, so the two cannot disagree about who wrote a message.
 */
import { describe, it, expect } from 'vitest';
import { isOutgoingEvent, parseSender } from '@/lib/messageHelpers';

describe('isOutgoingEvent', () => {
  it.each([
    ['an inbound customer message', { type: 'inbound', authorEmail: 'ada@x.io' }, false],
    ['an inbound with no author / metadata', { type: 'inbound' }, false],
    ['an inbound with null metadata', { type: 'inbound', metadata: null }, false],
    ['an agent reply', { type: 'agent_reply', authorEmail: 'me@us.io' }, true],
    ['the bot (any case)', { type: 'inbound', authorEmail: 'BOT' }, true],
    ['a system reply', { type: 'inbound', metadata: { isSystemReply: true } }, true],
    [
      'isSystemReply "true" (string) is not a flag',
      { type: 'inbound', metadata: { isSystemReply: 'true' } },
      false,
    ],
  ] as const)('%s → %s', (_name, event, expected) => {
    expect(isOutgoingEvent(event)).toBe(expected);
  });
});

describe('parseSender — shared by the header and the Customer tab', () => {
  it('a name that is the address again is no name: the address shows once', () => {
    expect(parseSender('a@x.com <a@x.com>')).toEqual({ name: null, address: 'a@x.com' });
    expect(parseSender('  "Ada" <a@x.com>  ')).toEqual({ name: 'Ada', address: 'a@x.com' });
    expect(parseSender(undefined)).toEqual({ name: null, address: '' });
  });

  it('edge shapes keep what the header’s old parser gave', () => {
    // Text after the address: the address is still the bare one (the profile lookup uses it).
    expect(parseSender('Ada <a@x.io> (via form)')).toEqual({ name: 'Ada', address: 'a@x.io' });
    // An unbalanced quote is still quoting, not part of the name.
    expect(parseSender('"Ada <a@x.io>')).toEqual({ name: 'Ada', address: 'a@x.io' });
    expect(parseSender('Ada < a@x.io >')).toEqual({ name: 'Ada', address: 'a@x.io' });
    expect(parseSender('+15551234')).toEqual({ name: null, address: '+15551234' });
    expect(parseSender('Ada <>')).toEqual({ name: null, address: 'Ada <>' });
  });
});

describe('parseSender — sender shapes', () => {
  it.each([
    ['a plain address', 'a@x.io', { name: null, address: 'a@x.io' }],
    ['Name <addr>', 'Ada Lovelace <a@x.io>', { name: 'Ada Lovelace', address: 'a@x.io' }],
    [
      'a quoted name with a comma',
      '"Kowalczyk, Marta" <m@x.io>',
      { name: 'Kowalczyk, Marta', address: 'm@x.io' },
    ],
    [
      'a quoted name that itself contains <…>',
      '"Smith <Sales>" <s@x.com>',
      { name: 'Smith <Sales>', address: 's@x.com' },
    ],
    [
      'a quoted name containing an address-like <…> before the real one',
      '"Ops <ops@old.io>" <s@x.com>',
      { name: 'Ops <ops@old.io>', address: 's@x.com' },
    ],
    [
      'trailing text after the address',
      'Ada <a@x.io> (via form)',
      { name: 'Ada', address: 'a@x.io' },
    ],
    [
      'trailing text holding a bracketed word with no @',
      'Ada <a@x.io> (via <web form>)',
      { name: 'Ada', address: 'a@x.io' },
    ],
    ['a name equal to the address', 'a@x.com <a@x.com>', { name: null, address: 'a@x.com' }],
    [
      'a name equal to the address in another case',
      'a@x.com <A@X.com>',
      { name: null, address: 'A@X.com' },
    ],
    [
      'a quoted name equal to the address',
      '"A@X.COM" <a@x.com>',
      { name: null, address: 'a@x.com' },
    ],
    ['a phone number', '+1 555 123 4567', { name: null, address: '+1 555 123 4567' }],
    ['a bracketed handle with no @', 'Ada <ada-chat>', { name: 'Ada', address: 'ada-chat' }],
    ['empty', '', { name: null, address: '' }],
    ['blank', '   ', { name: null, address: '' }],
  ] as const)('%s', (_shape, sender, expected) => {
    expect(parseSender(sender)).toEqual(expected);
  });
});
