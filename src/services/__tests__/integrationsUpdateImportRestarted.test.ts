import { describe, it, expect, vi, beforeEach } from 'vitest';

const patch = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/lib/api-client', () => ({ apiClient: { patch: (...args: unknown[]) => patch(...args) } }));

const { integrationsService } = await import('../integrations.service');

/** `importRestarted` is new on PATCH /api/integrations/:id; an older backend never sends it. */
describe('integrationsService.update — importRestarted', () => {
  beforeEach(() => patch.mockReset());

  it('⛔ passes the flag through when the server set it', async () => {
    patch.mockResolvedValue({ data: { success: true, data: { id: 1 }, importRestarted: true } });
    expect((await integrationsService.update(1, { type: 'gmail' })).importRestarted).toBe(true);
  });

  it.each([undefined, false, 'true', 1])('CONTROL: %j is not a restart', async (flag) => {
    patch.mockResolvedValue({ data: { success: true, data: { id: 1 }, importRestarted: flag } });
    expect((await integrationsService.update(1, { type: 'gmail' })).importRestarted).not.toBe(true);
  });
});
