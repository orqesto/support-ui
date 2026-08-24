/**
 * The SMTP panel previews what the server will do when its fields are left empty, so this
 * derivation has to agree with `submissionHostFor` in the backend's `integrationSmtpHelper`.
 * A preview that disagrees with the send path is worse than no preview: it tells an operator
 * their replies leave from somewhere they don't.
 */
import { describe, expect, it } from 'vitest';
import { deriveSmtpDefaults } from '@/utils/imapProviders';

describe('deriveSmtpDefaults', () => {
  it('swaps the imap prefix for smtp', () => {
    expect(deriveSmtpDefaults('imap.privateemail.com')).toEqual({
      host: 'smtp.privateemail.com',
      port: 587,
      secure: false,
    });
    expect(deriveSmtpDefaults('imap-mail.outlook.com')?.host).toBe('smtp-mail.outlook.com');
  });

  it('leaves a host alone when one name serves both protocols', () => {
    expect(deriveSmtpDefaults('mail.frame-house.eu')?.host).toBe('mail.frame-house.eu');
  });

  it('maps the one provider whose submission host shares no prefix with its IMAP host', () => {
    expect(deriveSmtpDefaults('outlook.office365.com')?.host).toBe('smtp.office365.com');
  });

  it('normalises case and whitespace, and has nothing to preview without a host', () => {
    expect(deriveSmtpDefaults('  IMAP.Gmail.com ')?.host).toBe('smtp.gmail.com');
    expect(deriveSmtpDefaults('')).toBeNull();
  });
});
