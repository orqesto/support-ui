/**
 * The inbox list must not put the filter set in a request line, and must not break on a
 * backend that has not caught up.
 *
 * `receivedAt` is a correspondent's email address; `search` is whatever the agent typed,
 * routinely a customer's name, order number or address. In a query string both land in
 * the browser address bar, in history, in every shared or saved link, in the `Referer` of
 * the next click, and in the standard access log, which records the full request line.
 *
 * This repo deploys on merge while the backend ships on a tag, so the POST route is
 * genuinely absent in production for a while. The fallback is what keeps the inbox — the
 * hottest path in the product — from depending on deploy ordering.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const get = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const post = vi.fn<(...args: unknown[]) => Promise<unknown>>();

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
  },
}));

const ok = { data: { success: true, data: [], pagination: { total: 0 } } };
const notFound = Object.assign(new Error('Not Found'), { status: 404 });

import { messageService } from '@/services/message.service';
import { resetThreadsSearchSupport } from '@/services/threadsQuery';

describe('getThreads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The route-support memo is module state and latches after the first probe, so a
    // suite that did not reset it would inherit the previous test's answer.
    resetThreadsSearchSupport();
  });

  const load = () => messageService;

  it('posts the filters in a body, leaving the request line clean', async () => {
    post.mockResolvedValue(ok);
    const service = load();
    await service.getThreads({ receivedAt: 'someone@example.com', search: 'Order #123' });

    expect(post).toHaveBeenCalledTimes(1);
    const [url, body] = post.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe('/api/messages/threads/search');
    expect(url).not.toContain('@');
    expect(body.receivedAt).toBe('someone@example.com');
    expect(body.search).toBe('Order #123');
    expect(get).not.toHaveBeenCalled();
  });

  it('falls back to the GET when the route is absent', async () => {
    post.mockRejectedValue(notFound);
    get.mockResolvedValue(ok);
    const service = load();
    await expect(service.getThreads({ view: 'open' })).resolves.toBeTruthy();
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('sends receivedAt in the fallback query, because an old backend cannot read it anywhere else', async () => {
    // Withholding it would not protect anything on a backend that also lacks the header
    // — it would silently drop the filter and show a WIDER list as though it were
    // filtered. A wrong answer presented as right is worse than the exposure.
    post.mockRejectedValue(notFound);
    get.mockResolvedValue(ok);
    const service = load();
    await service.getThreads({ receivedAt: 'someone@example.com' });
    const [url] = get.mock.calls[0] as [string];
    expect(url).toContain('receivedAt=someone%40example.com');
  });

  it('stops retrying the POST once it is known to be missing', async () => {
    post.mockRejectedValue(notFound);
    get.mockResolvedValue(ok);
    const service = load();
    await service.getThreads({ view: 'open' });
    await service.getThreads({ view: 'open' });
    // One probe, not one per list read — this is the inbox's hottest path.
    expect(post).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('does NOT fall back on a real failure', async () => {
    // A 500 rerun as a GET would quietly become a different query, and the agent would
    // be shown a plausible wrong list instead of an error.
    post.mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }));
    const service = load();
    await expect(service.getThreads({ view: 'open' })).rejects.toThrow('boom');
    expect(get).not.toHaveBeenCalled();
  });
});
