import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * An unfinished thread-list answer (backend search plan step 3½) must not reach a caller that
 * would read it as "empty" or as a count: getThreads throws ListTimedOutError for everyone except
 * the thread list, which opts in and says so on screen.
 */
const answer = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock('../threadsQuery', () => ({ fetchThreads: vi.fn(() => Promise.resolve(answer.current)) }));

const { messageService, ListTimedOutError, exactTotal } = await import('../message.service');

const base = {
  success: true,
  data: [],
  pagination: { page: 1, limit: 1, total: 0, totalPages: 0, hasMore: false },
  search: null,
};

beforeEach(() => {
  answer.current = { ...base };
});

describe('getThreads on an unfinished answer', () => {
  it('throws when the page ran out of time', async () => {
    answer.current = { ...base, timedOut: true };
    await expect(messageService.getThreads({}, 1, 1)).rejects.toBeInstanceOf(ListTimedOutError);
  });

  it('throws when only the count ran out of time — a counter must not print it', async () => {
    answer.current = {
      ...base,
      data: [{ threadId: 'conv_1' }],
      pagination: { ...base.pagination, total: 2, countTimedOut: true, totalCapped: true },
    };
    await expect(messageService.getThreads({}, 1, 1)).rejects.toBeInstanceOf(ListTimedOutError);
  });

  it('throws when the search reading says it ran out of time', async () => {
    answer.current = {
      ...base,
      search: { terms: ['the'], asPhrase: false, cutShort: [], timedOut: true },
    };
    await expect(messageService.getThreads({ search: 'the' })).rejects.toBeInstanceOf(
      ListTimedOutError
    );
  });

  it('the thread list opts in and gets the answer, flags intact', async () => {
    answer.current = { ...base, timedOut: true };
    const response = await messageService.getThreads({}, 1, 25, undefined, 'time', {
      allowTimedOut: true,
    });
    expect(response.timedOut).toBe(true);
  });

  it('CONTROL: a finished answer — and an older backend without the fields — passes through', async () => {
    await expect(messageService.getThreads({}, 1, 1)).resolves.toMatchObject({ success: true });
  });
});

describe('exactTotal', () => {
  const pagination = { page: 1, limit: 1, total: 10_000, totalPages: 10_000, hasMore: true };
  it('a capped or cut-short total is not a number a counter may show', () => {
    expect(exactTotal({ ...pagination, totalCapped: true })).toBeUndefined();
    expect(exactTotal({ ...pagination, countTimedOut: true })).toBeUndefined();
  });
  it('CONTROL: an exact total, or one from an older backend, is shown', () => {
    expect(exactTotal({ ...pagination, totalCapped: false })).toBe(10_000);
    expect(exactTotal(pagination)).toBe(10_000);
  });
});
