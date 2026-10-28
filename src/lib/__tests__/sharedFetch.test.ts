import { afterEach, describe, expect, it, vi } from 'vitest';
import { invalidateSharedFetch, peekSharedFetch, sharedFetch } from '../sharedFetch';

afterEach(() => {
  invalidateSharedFetch();
  vi.useRealTimers();
});

describe('sharedFetch', () => {
  it('callers asking at once share ONE request', async () => {
    const fetcher = vi.fn(() => Promise.resolve({ on: true }));
    const [first, second] = await Promise.all([
      sharedFetch('k', fetcher, 1000),
      sharedFetch('k', fetcher, 1000),
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  it('reuses the answer within the TTL, asks again after it', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(() => Promise.resolve(1));
    await sharedFetch('k', fetcher, 1000);
    await sharedFetch('k', fetcher, 1000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(peekSharedFetch('k', 1000)).toBe(1);
    vi.advanceTimersByTime(1001);
    expect(peekSharedFetch('k', 1000)).toBeUndefined();
    await sharedFetch('k', fetcher, 1000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('keys are separate (another workspace asks for itself)', async () => {
    const fetcher = vi.fn((value: number) => Promise.resolve(value));
    expect(await sharedFetch('ui-flags:1', () => fetcher(1), 1000)).toBe(1);
    expect(await sharedFetch('ui-flags:2', () => fetcher(2), 1000)).toBe(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('a failure is not cached: the next caller asks again', async () => {
    const fetcher = vi
      .fn<() => Promise<number>>()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce(5);
    await expect(sharedFetch('k', fetcher, 1000)).rejects.toThrow('down');
    expect(await sharedFetch('k', fetcher, 1000)).toBe(5);
  });

  it('invalidating a key makes the next caller ask again', async () => {
    const fetcher = vi.fn(() => Promise.resolve(1));
    await sharedFetch('k', fetcher, 60_000);
    invalidateSharedFetch('k');
    await sharedFetch('k', fetcher, 60_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
