/**
 * The nightly review's own changes on a worklist row (G5): the row's `autoCleaned` /
 * `heldForReview` are read defensively (an older backend sends neither), and the undo route's
 * 404 / 409 are answers, not failures.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

// A plain function per test, not a module-level vi.fn: a rejection from a module-level vi.fn
// fails the test even when the service catches it (vitest 4).
let postImpl: (url: string, body?: unknown) => Promise<unknown> = () =>
  Promise.resolve({ data: {} });
const calls: { url: string; body: unknown }[] = [];
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    post: (url: string, body?: unknown) => {
      calls.push({ url, body });
      return postImpl(url, body);
    },
  },
}));

const { kbQualityService } = await import('../kbQuality.service');

afterEach(() => {
  calls.length = 0;
  postImpl = () => Promise.resolve({ data: {} });
});

const refusal = (status: number, error: string) =>
  Object.assign(new Error(error), { status, data: { success: false, error } });

describe('kbQualityService.undo', () => {
  it('posts to the undo route', async () => {
    expect(await kbQualityService.undo(501)).toEqual({ outcome: 'undone' });
    expect(calls).toEqual([
      { url: '/api/knowledge-base/consolidation/quality/501/undo', body: {} },
    ]);
  });

  it('a 409 (changed since) and a 404 (nothing to undo) are answers', async () => {
    postImpl = () => Promise.reject(refusal(409, 'The entry changed since'));
    expect(await kbQualityService.undo(501)).toEqual({
      outcome: 'refused',
      status: 409,
      message: 'The entry changed since',
    });
    postImpl = () => Promise.reject(refusal(404, 'Nothing to undo'));
    expect(await kbQualityService.undo(501)).toEqual({
      outcome: 'refused',
      status: 404,
      message: 'Nothing to undo',
    });
  });

  it('any other failure is thrown', async () => {
    postImpl = () => Promise.reject(refusal(500, 'boom'));
    await expect(kbQualityService.undo(501)).rejects.toThrow('boom');
  });
});
