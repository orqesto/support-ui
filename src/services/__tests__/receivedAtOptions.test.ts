import { vi, describe, it, expect, beforeEach } from 'vitest';

const get = vi.fn<(...args: unknown[]) => Promise<unknown>>();

vi.mock('@/lib/api-client', () => ({ apiClient: { get: (...args: unknown[]) => get(...args) } }));

import { messageService } from '@/services/message.service';

/**
 * The alias list that populates the "Received at" filter.
 *
 * The frontend deploys on merge while the backend ships on its own cadence, so
 * this route 404s in production during that window. While it does, the filter
 * must simply not offer itself — an unhandled rejection here would take the
 * whole filters bar down with it.
 */
describe('messageService.getReceivedAtOptions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the addresses the backend reports', async () => {
    get.mockResolvedValue({ data: { success: true, data: ['info@acme.com', 'sales@acme.com'] } });
    await expect(messageService.getReceivedAtOptions()).resolves.toEqual([
      'info@acme.com',
      'sales@acme.com',
    ]);
  });

  it('returns [] when the endpoint is not deployed yet', async () => {
    get.mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }));
    await expect(messageService.getReceivedAtOptions()).resolves.toEqual([]);
  });

  it('returns [] rather than undefined when the payload has no data', async () => {
    // The filter checks `.length`; undefined would throw at the render site.
    get.mockResolvedValue({ data: { success: true } });
    await expect(messageService.getReceivedAtOptions()).resolves.toEqual([]);
  });
});
