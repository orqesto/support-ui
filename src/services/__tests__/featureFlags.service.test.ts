import { vi, describe, it, expect, beforeEach } from 'vitest';

/**
 * This frontend ships to production on merge to `main`, the backend ships on its own
 * train. So `/api/feature-flags/ui` will 404 in production for however long that gap
 * lasts — and the whole point of a `ui.` flag is to keep an unfinished screen hidden.
 *
 * Failing OPEN would therefore expose exactly what the mechanism exists to hide, during
 * the window where nobody is looking for it. These pin that it fails CLOSED.
 */
const get = vi.fn();
vi.mock('@/lib/api-client', () => ({ apiClient: { get, patch: vi.fn(), post: vi.fn() } }));

const { featureFlagsService } = await import('../featureFlags.service');

beforeEach(() => {
  get.mockReset();
});

describe('featureFlagsService.getUiFlags', () => {
  it('returns the resolved flags', async () => {
    get.mockResolvedValue({ data: { success: true, data: { 'ui.billing_intelligence': true } } });
    await expect(featureFlagsService.getUiFlags()).resolves.toEqual({
      'ui.billing_intelligence': true,
    });
  });

  it('returns {} when the endpoint 404s — the backend has not shipped yet', async () => {
    get.mockRejectedValue({ response: { status: 404 } });
    await expect(featureFlagsService.getUiFlags()).resolves.toEqual({});
  });

  it('returns {} on a network failure', async () => {
    get.mockRejectedValue(new Error('Network Error'));
    await expect(featureFlagsService.getUiFlags()).resolves.toEqual({});
  });

  it('returns {} when the payload has no data — never undefined', async () => {
    // A caller doing `flags[key]` on undefined would throw and take the page down, which
    // is the failure mode this whole family of bugs keeps producing.
    get.mockResolvedValue({ data: { success: true } });
    await expect(featureFlagsService.getUiFlags()).resolves.toEqual({});
  });
});
