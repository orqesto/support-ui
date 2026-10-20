/**
 * The threads filter's Source list for every role (staging 2026-10-19: support's was empty — the
 * filter read GET /api/integrations, which needs VIEW_INTEGRATIONS). An older backend without the
 * new route matches it as `GET /:id` — 404, 400, or 403 for support (prod v1.1.297) — and the full
 * list is read instead; a role refused that too gets no options rather than an error.
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

  it.each([404, 400, 403])(
    'an older backend (%i): the full list, reduced to the same shape',
    async (status) => {
      get.mockRejectedValue({ response: { status } });
      getAll.mockResolvedValue({
        success: true,
        data: [{ id: 2, name: 'Desk', type: 'email', enabled: false, config: { password: 'x' } }],
      });
      expect(await getMessageSourceOptions()).toEqual([
        { id: 2, name: 'Desk', type: 'email', active: false },
      ]);
    }
  );

  it('an older backend and a role that may not read the full list either: no options', async () => {
    get.mockRejectedValue({ response: { status: 403 } });
    getAll.mockRejectedValue({ response: { status: 403 } });
    expect(await getMessageSourceOptions()).toEqual([]);
  });

  it('a failing full list is not hidden', async () => {
    get.mockRejectedValue({ response: { status: 404 } });
    getAll.mockRejectedValue({ response: { status: 500 } });
    await expect(getMessageSourceOptions()).rejects.toEqual({ response: { status: 500 } });
  });

  it('a failing options route is not hidden behind the full list', async () => {
    get.mockRejectedValue({ response: { status: 500 } });
    await expect(getMessageSourceOptions()).rejects.toEqual({ response: { status: 500 } });
    expect(getAll).not.toHaveBeenCalled();
  });
});
