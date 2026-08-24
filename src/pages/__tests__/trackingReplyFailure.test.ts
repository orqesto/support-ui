/**
 * The customer-facing reply form. Its 429/409 ladder read `err.response.status`,
 * which the api-client interceptor never produces, so every failure — including a
 * closed request — rendered as "Something went wrong sending your reply. Please try
 * again." A customer told that has every reason to keep retrying a request that can
 * never accept another reply.
 *
 * Fixtures come from the real interceptor via `@/test/apiError`; a hand-written
 * `{ response: { status } }` would pass against the broken code too.
 */
import { describe, expect, it } from 'vitest';
import { describeReplyFailure } from '@/pages/TrackingPage';
import { apiError, networkError } from '@/test/apiError';

describe('describeReplyFailure', () => {
  it('tells a customer their request is closed instead of inviting a retry', async () => {
    expect(await apiError(409, { success: false }).then(describeReplyFailure)).toBe(
      'This request is closed. Email us back to start a new one.'
    );
  });

  it('names the rate limit', async () => {
    expect(await apiError(429, { success: false }).then(describeReplyFailure)).toBe(
      "You've sent quite a few replies recently. Wait a bit and try again."
    );
  });

  it("prefers the server's own safe copy when it sent some", async () => {
    expect(
      await apiError(400, { error: 'Your reply is too long.' }).then(describeReplyFailure)
    ).toBe('Your reply is too long.');
  });

  it('falls back to the generic line for a network drop or an unmapped status', async () => {
    expect(await networkError().then(describeReplyFailure)).toBe(
      'Something went wrong sending your reply. Please try again.'
    );
    expect(await apiError(418, { success: false }).then(describeReplyFailure)).toBe(
      'Something went wrong sending your reply. Please try again.'
    );
  });

  it('never leaks a 5xx body to a customer', async () => {
    const message = await apiError(500, {
      error: 'relation "conversations" does not exist',
    }).then(describeReplyFailure);
    expect(message).not.toContain('conversations');
    expect(message).toBe('Something went wrong sending your reply. Please try again.');
  });
});
