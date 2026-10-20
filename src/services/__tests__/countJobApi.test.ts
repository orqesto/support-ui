import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const posts: Array<{ url: string; body: unknown }> = [];
const gets: string[] = [];
const deletes: string[] = [];
/** What each GET answers, in turn (the last one repeats). */
let polls: unknown[] = [];
let startAnswer: () => Promise<unknown> = () => Promise.resolve({});
/** When set, the next GET rejects with it (once). */
let getFails: Error | null = null;

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    post: (url: string, body?: unknown) => {
      posts.push({ url, body });
      return startAnswer();
    },
    get: (url: string) => {
      gets.push(url);
      if (getFails) {
        const failure = getFails;
        getFails = null;
        // In flight for a moment, then fails — long enough to stop following meanwhile.
        return new Promise((_resolve, reject) => setTimeout(() => reject(failure), 10));
      }
      const next = polls.length > 1 ? polls.shift() : polls[0];
      return Promise.resolve({ data: { success: true, data: next } });
    },
    delete: (url: string) => {
      deletes.push(url);
      return Promise.resolve({ data: { success: true } });
    },
  },
}));

import { CANCEL_COUNT, CountPollStopped, countProgressText, runCountJob } from '../countJobApi';

const JOB = '11111111-2222-4333-8444-555555555555';
const running = (listed: number) => ({
  jobId: JOB,
  state: 'running',
  listed,
  startedAt: '2026-10-20T12:00:00.000Z',
  result: null,
});
const done = (status: number, body: Record<string, unknown>) => ({
  ...running(80_000),
  state: 'done',
  result: { status, body },
});

const follow = async <T>(promise: Promise<T>) => {
  const settled = promise.then(
    (value) => ({ value }),
    (error: unknown) => ({ error })
  );
  await vi.runAllTimersAsync();
  return settled;
};

describe('runCountJob', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    posts.length = 0;
    gets.length = 0;
    deletes.length = 0;
    polls = [];
    startAnswer = () => Promise.resolve({ data: { success: true, data: running(0) } });
  });
  afterEach(() => vi.useRealTimers());

  it('starts the job, reports progress while it runs, and resolves with the answer', async () => {
    polls = [
      running(25_000),
      running(63_500),
      done(200, { success: true, data: { count: 80_000 } }),
    ];
    const seen: number[] = [];
    const outcome = await follow(
      runCountJob<{ count: number }>({
        sourceId: 68,
        kind: 'gmail-count',
        params: { bulkImportDays: 180 },
        onProgress: (progress) => seen.push(progress.listed),
        fallback: () => Promise.reject(new Error('not used')),
      })
    );
    expect(outcome).toEqual({ value: { count: 80_000 } });
    expect(posts).toEqual([
      {
        url: '/api/integrations/68/count-jobs',
        body: { kind: 'gmail-count', params: { bulkImportDays: 180 } },
      },
    ]);
    expect(seen).toEqual([0, 25_000, 63_500]);
    expect(gets.every((url) => url === `/api/integrations/68/count-jobs/${JOB}`)).toBe(true);
  });

  it("throws the count route's refusal with its status and body, as the api-client would", async () => {
    polls = [done(504, { success: false, code: 'COUNT_TIMED_OUT', error: 'Too slow.' })];
    const outcome = await follow(
      runCountJob({
        sourceId: 7,
        kind: 'kb-history-range',
        params: { days: 90 },
        fallback: vi.fn(),
      })
    );
    expect('error' in outcome && outcome.error).toMatchObject({
      message: 'Too slow.',
      status: 504,
      data: { code: 'COUNT_TIMED_OUT' },
    });
  });

  it('an older backend without the job route: the request route answers instead', async () => {
    startAnswer = () =>
      Promise.reject(
        Object.assign(new Error('Not found'), { status: 404, data: '<pre>Cannot POST</pre>' })
      );
    const fallback = vi.fn(() => Promise.resolve({ count: 50_000 }));
    const outcome = await follow(
      runCountJob({ sourceId: 68, kind: 'gmail-count', params: {}, fallback })
    );
    expect(outcome).toEqual({ value: { count: 50_000 } });
    expect(gets).toEqual([]);
  });

  it('a 404 from the job route itself is a refusal, not an older backend (control)', async () => {
    startAnswer = () =>
      Promise.reject(
        Object.assign(new Error('Not found'), {
          status: 404,
          data: { success: false, error: 'Gmail source not found' },
        })
      );
    const fallback = vi.fn();
    const outcome = await follow(
      runCountJob({ sourceId: 68, kind: 'gmail-count', params: {}, fallback })
    );
    expect('error' in outcome).toBe(true);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('closing stops following but leaves the count running; a cancel also cancels it', async () => {
    polls = [running(10)];
    const closed = new AbortController();
    const closing = follow(
      runCountJob({
        sourceId: 3,
        kind: 'imap-count',
        params: {},
        signal: closed.signal,
        fallback: vi.fn(),
      })
    );
    closed.abort();
    expect(await closing).toEqual({ error: expect.any(CountPollStopped) as CountPollStopped });
    expect(deletes).toEqual([]);

    const changed = new AbortController();
    const cancelling = follow(
      runCountJob({
        sourceId: 3,
        kind: 'imap-count',
        params: {},
        signal: changed.signal,
        fallback: vi.fn(),
      })
    );
    changed.abort(CANCEL_COUNT);
    expect(await cancelling).toEqual({ error: expect.any(CountPollStopped) as CountPollStopped });
    expect(deletes).toEqual([`/api/integrations/3/count-jobs/${JOB}`]);
  });

  it('a start refused because the just-cancelled count is still unwinding is retried', async () => {
    let refusals = 2;
    startAnswer = () =>
      refusals-- > 0
        ? Promise.reject(
            Object.assign(new Error('busy'), {
              status: 409,
              data: { success: false, code: 'COUNT_IN_PROGRESS', error: 'Still running.' },
            })
          )
        : Promise.resolve({ data: { success: true, data: running(0) } });
    polls = [done(200, { success: true, data: { count: 3 } })];
    const outcome = await follow(
      runCountJob({ sourceId: 68, kind: 'gmail-count', params: {}, fallback: vi.fn() })
    );
    expect(outcome).toEqual({ value: { count: 3 } });
    expect(posts).toHaveLength(3);
  });

  it('control: any other refusal of the start is shown at once, not retried', async () => {
    startAnswer = () =>
      Promise.reject(
        Object.assign(new Error('busy'), {
          status: 429,
          data: { success: false, code: 'COUNT_BUSY', error: 'Other counts are running.' },
        })
      );
    const outcome = await follow(
      runCountJob({ sourceId: 68, kind: 'gmail-count', params: {}, fallback: vi.fn() })
    );
    expect('error' in outcome && outcome.error).toMatchObject({ status: 429 });
    expect(posts).toHaveLength(1);
  });

  it('a poll that fails after the panel stopped following is not an error', async () => {
    polls = [running(10)];
    getFails = new Error('Network Error');
    const closed = new AbortController();
    const closing = runCountJob({
      sourceId: 3,
      kind: 'imap-count',
      params: {},
      signal: closed.signal,
      fallback: vi.fn(),
    }).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(755); // the first poll is now in flight
    expect(gets).toHaveLength(1);
    closed.abort();
    await vi.advanceTimersByTimeAsync(20); // ...and fails
    expect(await closing).toBeInstanceOf(CountPollStopped);
  });

  it('a cancel is sent at once, while the wait between polls is still running', async () => {
    polls = [running(10)];
    const changed = new AbortController();
    const cancelling = runCountJob({
      sourceId: 3,
      kind: 'imap-count',
      params: {},
      signal: changed.signal,
      fallback: vi.fn(),
    }).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(1); // started, now waiting before the first poll
    changed.abort(CANCEL_COUNT);
    expect(deletes).toEqual([`/api/integrations/3/count-jobs/${JOB}`]);
    expect(await cancelling).toBeInstanceOf(CountPollStopped);
    expect(gets).toEqual([]);
  });
});

describe('countProgressText', () => {
  const at = Date.parse('2026-10-20T12:00:00.000Z');
  it('says how many are listed so far, and for how long once it is minutes', () => {
    expect(countProgressText(null)).toBe('Counting…');
    expect(countProgressText({ listed: 0, startedAt: '2026-10-20T12:00:00.000Z' }, at)).toBe(
      'Counting…'
    );
    expect(
      countProgressText({ listed: 63_500, startedAt: '2026-10-20T12:00:00.000Z' }, at + 150_000)
    ).toBe('Counting… 63,500 messages listed so far · 2 min');
  });
});
