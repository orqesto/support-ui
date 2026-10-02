/**
 * At most HTML_FETCH_SLOTS original-markup requests are in flight at once; the rest queue and
 * start as slots free up, in order. The API limiter is per address and per minute, and a burst
 * of markup fetches is the one thing in this app that scales with a thread's length.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Deferred = { resolve: (value: unknown) => void; reject: (reason: unknown) => void };
const pending: Deferred[] = [];
const get = vi.fn<(url: string) => Promise<unknown>>(
  () =>
    new Promise((resolve, reject) => {
      pending.push({ resolve, reject });
    })
);
vi.mock('@/lib/api-client', () => ({ apiClient: { get } }));

const { getMessageHtml, htmlFetchesInFlight, HTML_FETCH_SLOTS } = await import(
  '../message-html.service'
);

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  pending.length = 0;
  get.mockClear();
});

describe('getMessageHtml concurrency', () => {
  it('holds the fifth request until one of the first four finishes', async () => {
    const results = Array.from({ length: 6 }, (_, index) => getMessageHtml(index + 1));
    await settle();
    expect(get).toHaveBeenCalledTimes(HTML_FETCH_SLOTS);
    expect(htmlFetchesInFlight()).toBe(HTML_FETCH_SLOTS);
    expect(get.mock.calls.map(([url]) => url)).toEqual([
      '/api/messages/events/1/html',
      '/api/messages/events/2/html',
      '/api/messages/events/3/html',
      '/api/messages/events/4/html',
    ]);
    pending[0].resolve({ data: { data: { html: '<p>1</p>' } } });
    await settle();
    expect(get).toHaveBeenCalledTimes(5);
    expect(get.mock.calls[4][0]).toBe('/api/messages/events/5/html');
    await expect(results[0]).resolves.toBe('<p>1</p>');
    // A failure frees its slot too. (The rejection is caught before it lands: an unhandled one
    // fails the run, not the assertion.)
    const second = results[1].catch((err: unknown) => err);
    pending[1].reject(new Error('boom'));
    await settle();
    expect(get).toHaveBeenCalledTimes(6);
    expect(await second).toEqual(new Error('boom'));
    for (const handle of pending.slice(2)) handle.resolve({ data: { data: { html: null } } });
    await Promise.all(results.slice(2));
    expect(htmlFetchesInFlight()).toBe(0);
  });
});
