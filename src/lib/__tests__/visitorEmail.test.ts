import { describe, expect, it } from 'vitest';
import {
  NO_EMAIL,
  VISITOR_NO_EMAIL_NOTICE,
  WEBSITE_VISITOR_NO_EMAIL,
  emailLabel,
  isNoEmailVisitor,
  resolveVisitorNoEmailBlock,
  senderLabel,
  shownSender,
} from '../visitorEmail';

const PLACEHOLDER = 'anonymous@chat-widget.local';

describe('isNoEmailVisitor', () => {
  it('the stored placeholder, bare or behind a name, in any case and with spaces', () => {
    expect(isNoEmailVisitor(PLACEHOLDER)).toBe(true);
    expect(isNoEmailVisitor(`Dana <${PLACEHOLDER}>`)).toBe(true);
    expect(isNoEmailVisitor('  Anonymous@Chat-Widget.LOCAL ')).toBe(true);
  });

  it('CONTROL: a real address, a chat handle and nothing are not', () => {
    expect(isNoEmailVisitor('ada@example.com')).toBe(false);
    expect(isNoEmailVisitor('Ada <ada@example.com>')).toBe(false);
    expect(isNoEmailVisitor('@ada_handle')).toBe(false);
    expect(isNoEmailVisitor('')).toBe(false);
    expect(isNoEmailVisitor(null)).toBe(false);
    expect(isNoEmailVisitor(undefined)).toBe(false);
  });
});

describe('what is shown for a requester', () => {
  it('no name: one line, never the placeholder', () => {
    expect(senderLabel(PLACEHOLDER)).toBe(WEBSITE_VISITOR_NO_EMAIL);
    expect(shownSender(PLACEHOLDER)).toEqual({ name: null, address: WEBSITE_VISITOR_NO_EMAIL });
    expect(emailLabel(PLACEHOLDER)).toBe(NO_EMAIL);
  });

  it('a name is kept, with "no email" where the address would be', () => {
    expect(senderLabel(`Dana <${PLACEHOLDER}>`)).toBe('Dana (no email)');
    expect(shownSender(`Dana <${PLACEHOLDER}>`)).toEqual({ name: 'Dana', address: NO_EMAIL });
  });

  it('CONTROL: a real requester is shown as it is', () => {
    expect(senderLabel('Ada <ada@example.com>')).toBe('Ada <ada@example.com>');
    expect(shownSender('Ada <ada@example.com>')).toEqual({
      name: 'Ada',
      address: 'ada@example.com',
    });
    expect(emailLabel('ada@example.com')).toBe('ada@example.com');
    expect(senderLabel(null)).toBe('');
  });
});

describe('resolveVisitorNoEmailBlock', () => {
  const chat = { channel: 'chat', sender: PLACEHOLDER };

  it('blocks the reply of a website chat with no email, and says why', () => {
    expect(resolveVisitorNoEmailBlock(chat, 'reply')).toEqual({
      blocked: true,
      notice: VISITOR_NO_EMAIL_NOTICE,
      remaining: null,
      tone: 'warning',
    });
  });

  it('never blocks an internal note', () => {
    expect(resolveVisitorNoEmailBlock(chat, 'note').blocked).toBe(false);
  });

  it('CONTROL: an address left by the visitor, or another channel, is not blocked', () => {
    expect(
      resolveVisitorNoEmailBlock({ channel: 'chat', sender: 'ada@example.com' }, 'reply').blocked
    ).toBe(false);
    expect(
      resolveVisitorNoEmailBlock({ channel: 'email', sender: PLACEHOLDER }, 'reply').blocked
    ).toBe(false);
  });
});
