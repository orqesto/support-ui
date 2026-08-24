/**
 * The unverified-email branch must match the error the API CLIENT produces, not the
 * one axios throws.
 *
 * `api-client.ts` does not rethrow the axios error: it constructs a fresh Error and
 * copies `status` and `data` onto it, so `.response` is gone. A check written
 * against the axios shape type-checks, reads correctly, and never matches — the
 * branch simply never runs. These build the error exactly as the interceptor does.
 */
import { describe, expect, it } from 'vitest';
import { isUnverifiedEmailError } from '@/pages/LoginPage';

/** Mirrors api-client.ts: new Error(message) with status + data attached. */
const asClientError = (status: number, body: { error?: string; success?: boolean }) => {
  const err = new Error(body.error ?? 'error') as Error & {
    status?: number;
    data?: unknown;
  };
  err.status = status;
  err.data = body;
  return err;
};

describe('isUnverifiedEmailError', () => {
  it('matches the real 403 the backend sends', () => {
    expect(
      isUnverifiedEmailError(
        asClientError(403, { success: false, error: 'Please verify your email before logging in.' })
      )
    ).toBe(true);
  });

  it('does NOT match the raw axios shape — that is the bug this guards', () => {
    const axiosLike = {
      response: { status: 403, data: { error: 'Please verify your email before logging in.' } },
    };
    // If this ever returns true, someone reintroduced `.response` handling and the
    // real client error will stop matching.
    expect(isUnverifiedEmailError(axiosLike)).toBe(false);
  });

  it.each([
    [401, { error: 'Invalid credentials' }],
    [403, { error: 'Global admin access required' }],
    [500, { error: 'Please verify your email before logging in.' }],
  ])('leaves %p/%p reading as a normal failure', (status, body) => {
    expect(isUnverifiedEmailError(asClientError(status, body))).toBe(false);
  });

  it('tolerates a body with no error field', () => {
    expect(isUnverifiedEmailError(asClientError(403, {}))).toBe(false);
    expect(isUnverifiedEmailError(undefined)).toBe(false);
    expect(isUnverifiedEmailError(new Error('boom'))).toBe(false);
  });
});
