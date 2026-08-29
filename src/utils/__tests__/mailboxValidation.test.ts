/**
 * The client-side mirror of the backend's IMAP field rules.
 *
 * Reported: an email source was saved with `mailto:someone@example.com` and reported as
 * valid. The field was a raw `<input type="email">`, and browsers only enforce that on a
 * NATIVE FORM SUBMIT — this screen saves from a button handler with no `<form>`, so the
 * attribute validated nothing at all.
 *
 * ⚠️ These rules are a MIRROR, not the authority. The server validates independently and is
 * what actually protects the data; this exists so the message appears under the field being
 * typed in rather than after a round trip. The two must agree — the leniency below is
 * deliberate and matches `integrationConfigValidation.ts` on the backend.
 */
import { describe, it, expect } from 'vitest';
import {
  emailSourceErrors,
  hostError,
  isEmailSourceComplete,
  mailboxError,
  portError,
} from '@/utils/mailboxValidation';

describe('mailboxError', () => {
  it('rejects the reported mailto: paste', () => {
    expect(mailboxError('mailto:support@example.com')).toMatch(/mailto/i);
  });

  it.each([
    ['another URI scheme', 'imap://support@example.com'],
    ['an internal space', 'support @example.com'],
    ['two @ signs', 'a@@b.com'],
    ['an empty local part', '@example.com'],
    ['an empty domain', 'support@'],
  ])('rejects %s', (_label, value) => {
    expect(mailboxError(value)).not.toBeNull();
  });

  it('accepts an ordinary address', () => {
    expect(mailboxError('support@example.com')).toBeNull();
  });

  /**
   * ⛔ THE LENIENCY THAT MUST NOT BE TIGHTENED. Plenty of IMAP servers authenticate a bare
   * username with no `@`. Requiring a full address here would paint a working configuration
   * red and block Save on it — trading a real outage for a cosmetic check. The connection
   * probe decides whether credentials work.
   */
  it('accepts a bare username', () => {
    expect(mailboxError('support')).toBeNull();
  });

  /**
   * An UNTOUCHED field is incomplete, not wrong. Returning an error for empty would paint
   * the form red before anyone has typed a character.
   */
  it('says nothing about an empty field', () => {
    expect(mailboxError('')).toBeNull();
    expect(mailboxError('   ')).toBeNull();
  });
});

describe('hostError', () => {
  it('rejects a pasted URL', () => {
    expect(hostError('imaps://imap.example.com')).not.toBeNull();
    expect(hostError('imap.example.com/inbox')).not.toBeNull();
  });

  it('accepts an ordinary host', () => {
    expect(hostError('imap.example.com')).toBeNull();
  });

  // Single-label internal hostnames are legal and common on self-hosted deployments.
  it('accepts a single-label internal host', () => {
    expect(hostError('mailserver')).toBeNull();
  });

  it('says nothing about an empty field', () => {
    expect(hostError('')).toBeNull();
  });
});

describe('portError', () => {
  it.each([0, 65536, 1.5, -1])('rejects %s', (value) => {
    expect(portError(value)).not.toBeNull();
  });

  it('accepts 993', () => {
    expect(portError(993)).toBeNull();
  });

  it('says nothing about an empty field', () => {
    expect(portError('')).toBeNull();
  });
});

describe('form-level helpers', () => {
  const complete = { host: 'imap.example.com', port: 993, user: 'a@b.com', password: 'p' };

  it('collects every field complaint at once', () => {
    const errors = emailSourceErrors({
      host: 'imaps://x',
      port: 0,
      user: 'mailto:a@b.com',
      password: 'p',
    });

    expect(errors).toHaveLength(3);
  });

  it('reports none for a good config', () => {
    expect(emailSourceErrors(complete)).toEqual([]);
  });

  /**
   * CONTROL for the distinction the form depends on: a config can be COMPLETE and still
   * WRONG. Save is blocked on both, but only the wrongness paints a field red.
   */
  it('separates complete from correct', () => {
    const wrongButComplete = { ...complete, user: 'mailto:a@b.com' };

    expect(isEmailSourceComplete(wrongButComplete)).toBe(true);
    expect(emailSourceErrors(wrongButComplete)).toHaveLength(1);
  });

  it.each(['host', 'user', 'password'])('treats a missing %s as incomplete', (field) => {
    expect(isEmailSourceComplete({ ...complete, [field]: '' })).toBe(false);
  });
});
