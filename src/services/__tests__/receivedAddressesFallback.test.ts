/**
 * `getReceivedAddresses` returns `null` — not an empty list — when the backend has
 * no route for it, so the alias panel can say "this backend cannot suggest
 * addresses yet" instead of "you receive on nothing". The FE deploys on merge to
 * `main` while the BE ships on a tag, so that window is real.
 *
 * The branch was a bare `catch { return null }`, which made that sentence a lie for
 * every OTHER failure: a 500, a dropped connection or an expired session all
 * rendered as a permanent capability gap in the deployment. The two states are not
 * interchangeable — one is "upgrade the backend", the other is "try again".
 *
 * 🪤 A 404 here cannot mean "no such record": the endpoint takes no id. On a
 * backend that predates the route the path falls through to `GET /api/messages/:id`
 * and comes back as `Message not found`, which is why 404 is the absence signal.
 *
 * Fixtures come from the real interceptor via `@/test/apiError` — a hand-written
 * `{ response: { status } }` would pass whether or not the code reads the shape the
 * api-client actually throws.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const get = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiClient: { get, post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const { messageService } = await import('../message.service');
const { apiError, networkError } = await import('@/test/apiError');

beforeEach(() => {
  get.mockReset();
});

describe('messageService.getReceivedAddresses', () => {
  it('returns the addresses when the endpoint is there', async () => {
    get.mockResolvedValue({
      data: {
        data: [{ address: 'info@shop.es', conversations: 12, configured: true }],
        senderCandidates: [{ address: 'info@shop.se', conversations: 3, likelyOurs: true }],
        coverage: { conversations: 100, withDeliveryAddress: 40 },
      },
    });

    const result = await messageService.getReceivedAddresses();

    expect(result?.addresses).toEqual([
      {
        address: 'info@shop.es',
        conversations: 12,
        lastSeenAt: null,
        messageSourceIds: [],
        configured: true,
        declared: false,
        attachedToSourceId: null,
      },
    ]);
    expect(result?.senderCandidates[0]?.likelyOurs).toBe(true);
  });

  it('degrades to null on a real 404 — the backend has not shipped the route', async () => {
    // The body an older deploy actually returns, from the `:id` handler.
    get.mockRejectedValue(await apiError(404, { success: false, error: 'Message not found' }));
    await expect(messageService.getReceivedAddresses()).resolves.toBeNull();
  });

  it('rethrows anything that is not a 404, so a fault cannot read as "not shipped"', async () => {
    // The control: if this ever resolves to null again, the panel is back to
    // telling the admin their backend is too old when the request merely failed.
    get.mockRejectedValue(await apiError(500, { error: 'Internal Server Error' }));
    await expect(messageService.getReceivedAddresses()).rejects.toThrow();

    get.mockRejectedValue(await apiError(403, { error: 'Forbidden' }));
    await expect(messageService.getReceivedAddresses()).rejects.toThrow();

    get.mockRejectedValue(await networkError());
    await expect(messageService.getReceivedAddresses()).rejects.toThrow();
  });
});
