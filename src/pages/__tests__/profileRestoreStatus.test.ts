/**
 * The profile-restore ladder in App.tsx branches on the HTTP status of a failed
 * `/api/users/me`. It read `err.response.status`, which the api-client interceptor
 * never produces — it rebuilds the error with `status`/`data` and no `.response`.
 *
 * So the status was always undefined and every failure fell into the retry arm:
 * a genuine 401 never logged the user out, and a 402 (subscription inactive) was
 * retried four times and then surfaced as "Couldn't load your profile. Check your
 * connection and try again." — a connection error the user cannot act on, hiding
 * the subscription gate that the interceptor had already armed.
 *
 * This pins the decision the ladder makes, per status.
 */
import { describe, expect, it } from 'vitest';

type Outcome = 'logout' | 'gated' | 'retry';

/** The ladder from App.tsx, isolated. Keep in step with it. */
const decide = (err: unknown): Outcome => {
  const status = (err as { status?: number } | null)?.status;
  if (status === 401 || status === 403) return 'logout';
  if (status === 402) return 'gated';
  return 'retry';
};

/** Mirrors api-client.ts: a fresh Error with status/data copied on. */
const clientError = (status: number) => {
  const err = new Error('failed') as Error & { status?: number };
  err.status = status;
  return err;
};

describe('profile restore, by status', () => {
  it.each([401, 403])('ends the session on %i', (status) => {
    expect(decide(clientError(status))).toBe('logout');
  });

  it('does NOT retry a 402 — payment state cannot change between backoffs', () => {
    expect(decide(clientError(402))).toBe('gated');
  });

  it.each([500, 502, 0])('retries a transient %i rather than dropping the session', (status) => {
    expect(decide(clientError(status))).toBe('retry');
  });

  it('retries when there is no status at all (offline, DNS)', () => {
    expect(decide(new Error('Network Error'))).toBe('retry');
    expect(decide(null)).toBe('retry');
  });

  it('reads the client error shape, not the axios one', () => {
    // The bug: with `.response` the status was invisible, so a 401 read as "retry".
    const axiosLike = { response: { status: 401 } };
    expect(decide(axiosLike)).toBe('retry');
    expect(decide(clientError(401))).toBe('logout');
  });
});
