import { describe, expect, it } from 'vitest';
import { resolveSendFailureMessage } from '@/components/messages/sendErrorMessage';

/**
 * What an agent is told when a send fails.
 *
 * The generic "please try again" is fine for a network blip and actively WRONG for a
 * WhatsApp conversation whose 24-hour window has closed: retrying can never succeed, and
 * the agent needs to know a template is the only way through. The BE already sends that
 * copy on a 409 — this decides whether it survives to the screen.
 */
const err = (message: string, status?: number) =>
  Object.assign(new Error(message), { status });

const GENERIC = 'Failed to send. Please try again.';
const WINDOW_CLOSED =
  'WhatsApp only allows free-form replies within 24 hours of the customer’s last message.';

describe('resolveSendFailureMessage', () => {
  it('shows the server’s explanation on a 409', () => {
    expect(resolveSendFailureMessage(err(WINDOW_CLOSED, 409))).toBe(WINDOW_CLOSED);
  });

  it('shows it for other client errors too', () => {
    expect(resolveSendFailureMessage(err('Message has no sender information', 400))).toBe(
      'Message has no sender information'
    );
  });

  it('CONTROL: hides server detail on a 5xx', () => {
    // Internals must not leak, and a 500 genuinely IS worth retrying.
    expect(resolveSendFailureMessage(err('Postgres connection refused at 10.0.0.4', 500))).toBe(
      GENERIC
    );
  });

  it('falls back to generic when there is no status (network failure)', () => {
    expect(resolveSendFailureMessage(err('Network Error'))).toBe(GENERIC);
  });

  it('falls back to generic on a non-Error rejection', () => {
    expect(resolveSendFailureMessage('something odd')).toBe(GENERIC);
    expect(resolveSendFailureMessage(undefined)).toBe(GENERIC);
  });

  it('falls back to generic when a 4xx carries an empty message', () => {
    // An empty string must not render as a blank error box.
    expect(resolveSendFailureMessage(err('', 422))).toBe(GENERIC);
  });
});
