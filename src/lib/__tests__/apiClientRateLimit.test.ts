/**
 * A 429 from the API limiter: a GET is retried once after the wait the server named; a write
 * is not replayed; a retry refused again is the error it is; a wait too long to hold a request
 * open for is not waited.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type * as ApiClientModule from '@/lib/api-client';
import { rateLimitRetryAfterMs, RATE_LIMIT_RETRY_MAX_SECONDS } from '../rateLimit';

const limited = (config: Record<string, unknown>, retryAfter: unknown = 25) =>
  Object.assign(new Error('Request failed with status code 429'), {
    isAxiosError: true,
    response: {
      status: 429,
      data: { success: false, code: 'RATE_LIMITED', error: 'Too many API requests', retryAfter },
    },
    config,
  });

let api: typeof ApiClientModule;
beforeEach(async () => {
  vi.useFakeTimers();
  api = await vi.importActual<typeof ApiClientModule>('@/lib/api-client');
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('rateLimitRetryAfterMs', () => {
  it('reads the seconds the server named, as milliseconds', () => {
    expect(rateLimitRetryAfterMs({ retryAfter: 25 })).toBe(25_000);
    expect(rateLimitRetryAfterMs({ retryAfter: '2' })).toBe(2_000);
    expect(rateLimitRetryAfterMs({ retryAfter: 0.4 })).toBe(400);
  });

  it('no wait, a nonsense wait, or one past the ceiling: null', () => {
    for (const body of [
      undefined,
      {},
      { retryAfter: 0 },
      { retryAfter: -1 },
      { retryAfter: 'soon' },
      { retryAfter: '' },
      { retryAfter: RATE_LIMIT_RETRY_MAX_SECONDS + 1 },
    ]) {
      expect(rateLimitRetryAfterMs(body)).toBeNull();
    }
  });
});

describe('handleResponseError on a 429', () => {
  it('a GET is retried once, after the named wait, and the retry’s answer is returned', async () => {
    const request = vi.spyOn(api.apiClient, 'request').mockResolvedValue({ data: 'later' });
    const config = { method: 'get', url: '/api/messages/7/thread' };
    const outcome = api.handleResponseError(limited(config, 2));
    await vi.advanceTimersByTimeAsync(1_999);
    expect(request).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await expect(outcome).resolves.toEqual({ data: 'later' });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ url: '/api/messages/7/thread' }));
  });

  it('a retried GET refused again is not retried a third time', async () => {
    const request = vi.spyOn(api.apiClient, 'request').mockResolvedValue({ data: 'later' });
    const config = { method: 'get', url: '/api/x', _rateLimitRetry: true };
    const outcome = await api.handleResponseError(limited(config, 1)).catch((err: unknown) => err);
    expect(outcome).toMatchObject({ message: /Too many API requests/, status: 429 });
    expect(request).not.toHaveBeenCalled();
  });

  it('a write is never replayed', async () => {
    const request = vi.spyOn(api.apiClient, 'request').mockResolvedValue({ data: 'later' });
    const outcome = api
      .handleResponseError(limited({ method: 'post', url: '/api/messages/7/reply' }, 1))
      .catch((err: unknown) => err);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await outcome).toMatchObject({ message: /Too many API requests/, status: 429 });
    expect(request).not.toHaveBeenCalled();
  });

  it('a wait past the ceiling is not waited: the error is handed back at once', async () => {
    const request = vi.spyOn(api.apiClient, 'request').mockResolvedValue({ data: 'later' });
    const outcome = await api
      .handleResponseError(limited({ method: 'get', url: '/api/x' }, RATE_LIMIT_RETRY_MAX_SECONDS + 30))
      .catch((err: unknown) => err);
    expect(outcome).toMatchObject({ message: /Too many API requests/, status: 429 });
    expect(request).not.toHaveBeenCalled();
  });
});
