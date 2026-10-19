import { vi, describe, it, expect, beforeEach } from 'vitest';

const get = vi.fn<(...args: unknown[]) => Promise<unknown>>();

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: (...args: unknown[]) => get(...args) },
}));

import { messageService } from '@/services/message.service';

// The From list of "Compose new message". `null` only for a backend without the route (404) —
// the modal then falls back to every email source. Any other failure must surface, not silently
// widen the list to sources the agent may not send from.
describe('messageService.getComposeSources', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the sendable list', async () => {
    get.mockResolvedValue({
      data: { success: true, data: [{ id: 4, name: 'Billing', type: 'gmail' }] },
    });
    await expect(messageService.getComposeSources()).resolves.toEqual([
      { id: 4, name: 'Billing', type: 'gmail' },
    ]);
    expect(get).toHaveBeenCalledWith('/api/messages/compose/sources');
  });

  it('404 (an older backend) ⇒ null', async () => {
    get.mockRejectedValue({ response: { status: 404 } });
    await expect(messageService.getComposeSources()).resolves.toBeNull();
  });

  it.each([403, 500])('%s is thrown, not turned into the fallback', async (status) => {
    get.mockRejectedValue({ response: { status } });
    await expect(messageService.getComposeSources()).rejects.toEqual({ response: { status } });
  });
});
