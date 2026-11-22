import { vi, describe, it, expect, beforeEach } from 'vitest';
import { invalidateSharedFetch } from '@/lib/sharedFetch';

const get = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/lib/api-client', () => ({
  apiClient: { get: (...args: unknown[]) => get(...args) },
}));

import { organizationService } from '@/services/organization.service';

/**
 * Opening a thread reads the lead config from two places (the header's "is it configured", the
 * thread's lead fields). Both go through this method, which shares one request per scope for a
 * minute (scopedLookup) — so the server is asked once, together or one after the other.
 */
describe('organizationService.getLeadConfig — one request per thread open', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateSharedFetch();
  });

  it('two readers at once, and a third after the answer: one GET', async () => {
    get.mockResolvedValue({ data: { success: true, data: { qualificationFields: [] } } });
    const [first, second] = await Promise.all([
      organizationService.getLeadConfig(),
      organizationService.getLeadConfig(),
    ]);
    const third = await organizationService.getLeadConfig();
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('/api/organizations/lead-config');
    expect(second).toBe(first);
    expect(third).toBe(first);
  });
});
