/**
 * `listEvents` degrades to `available: false` on a 404 so the SCIM events panel can
 * hide itself while the backend that serves it has not shipped yet (this FE deploys
 * on merge to `main`, the BE ships on a tag).
 *
 * That branch read `error.response.status`, which the api-client interceptor never
 * produces — so the 404 fell through to `throw` and the panel raised an error
 * instead of hiding. The fixture here comes from the real interceptor; a
 * hand-written axios shape would pass either way and prove nothing.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const get = vi.fn();
vi.mock('@/lib/api-client', () => ({ apiClient: { get, post: vi.fn(), delete: vi.fn() } }));

const { allianceScimService } = await import('../alliance-scim.service');
const { apiError, networkError } = await import('@/test/apiError');

// 🪤 Braces are load-bearing. `beforeEach(() => get.mockReset())` RETURNS the mock,
// and Vitest treats a returned function as the teardown hook — so it calls `get()`
// after every test, which rejects with the fixture and fails the test that just
// passed, pointing at a line that is not the problem.
beforeEach(() => {
  get.mockReset();
});

describe('allianceScimService.listEvents', () => {
  it('returns the page when the endpoint is there', async () => {
    get.mockResolvedValue({ data: { data: { events: [{ id: 7 }], nextCursor: null } } });
    await expect(allianceScimService.listEvents(1)).resolves.toEqual({
      available: true,
      events: [{ id: 7 }],
      nextCursor: null,
    });
  });

  it('degrades to unavailable on a real 404 instead of throwing', async () => {
    get.mockRejectedValue(await apiError(404, { success: false, error: 'Not Found' }));
    await expect(allianceScimService.listEvents(1)).resolves.toEqual({
      available: false,
      events: [],
      nextCursor: null,
    });
  });

  it('still rethrows anything that is not a 404 — a 403 must not read as "not shipped"', async () => {
    get.mockRejectedValue(await apiError(403, { error: 'Forbidden' }));
    await expect(allianceScimService.listEvents(1)).rejects.toThrow();
    get.mockRejectedValue(await networkError());
    await expect(allianceScimService.listEvents(1)).rejects.toThrow();
  });
});
