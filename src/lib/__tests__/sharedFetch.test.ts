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

  it('an answer still in flight when the key is invalidated is not kept (a write overtook it)', async () => {
    let release: (value: string) => void = () => {};
    const before = vi.fn(() => new Promise<string>((resolve) => (release = resolve)));
    const pending = sharedFetch('k', before, 60_000);
    invalidateSharedFetch('k'); // the user saved a change meanwhile
    release('pre-write list');
    await expect(pending).resolves.toBe('pre-write list'); // its own caller still gets it
    const after = vi.fn(() => Promise.resolve('post-write list'));
    await expect(sharedFetch('k', after, 60_000)).resolves.toBe('post-write list');
    expect(after).toHaveBeenCalledTimes(1);
  });

  it('[control] the request that replaced it is kept', async () => {
    let release: (value: string) => void = () => {};
    void sharedFetch('k', () => new Promise<string>((resolve) => (release = resolve)), 60_000);
    invalidateSharedFetch('k');
    const fresh = vi.fn(() => Promise.resolve('fresh'));
    await sharedFetch('k', fresh, 60_000);
    release('stale'); // the old request lands after the new one
    await Promise.resolve();
    expect(peekSharedFetch('k', 60_000)).toBe('fresh');
  });

  it('invalidating a key makes the next caller ask again', async () => {
    const fetcher = vi.fn(() => Promise.resolve(1));
    await sharedFetch('k', fetcher, 60_000);
    invalidateSharedFetch('k');
    await sharedFetch('k', fetcher, 60_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
