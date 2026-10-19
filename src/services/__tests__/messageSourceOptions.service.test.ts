/**
 * The threads filter's Source list for every role (staging 2026-10-19: support's was empty — the
 * filter read GET /api/integrations, which needs VIEW_INTEGRATIONS). An older backend without the
 * new route answers 404, and the full list is read instead.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const get = vi.fn<(url: string) => Promise<unknown>>();
const getAll = vi.fn<() => Promise<unknown>>();
vi.mock('@/lib/api-client', () => ({ apiClient: { get: (url: string) => get(url) } }));
vi.mock('@/services/integrations.service', () => ({
  integrationsService: { getAll: () => getAll() },
}));

const { getMessageSourceOptions } = await import('../messageSourceOptions.service');

describe('getMessageSourceOptions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads the options route', async () => {
    get.mockResolvedValue({
      data: { success: true, data: [{ id: 1, name: 'Inbox', type: 'gmail', active: true }] },
    });
    expect(await getMessageSourceOptions()).toEqual([
      { id: 1, name: 'Inbox', type: 'gmail', active: true },
    ]);
    expect(get).toHaveBeenCalledWith('/api/integrations/message-sources');
    expect(getAll).not.toHaveBeenCalled();
  });

  it('an older backend (404): the full list, reduced to the same shape', async () => {
    get.mockRejectedValue({ response: { status: 404 } });
    getAll.mockResolvedValue({
      success: true,
      data: [{ id: 2, name: 'Desk', type: 'email', enabled: false, config: { password: 'x' } }],
    });
    expect(await getMessageSourceOptions()).toEqual([
      { id: 2, name: 'Desk', type: 'email', active: false },
    ]);
  });

  it('any other refusal is not hidden behind the full list', async () => {
    get.mockRejectedValue({ response: { status: 403 } });
    await expect(getMessageSourceOptions()).rejects.toEqual({ response: { status: 403 } });
    expect(getAll).not.toHaveBeenCalled();
  });
});
