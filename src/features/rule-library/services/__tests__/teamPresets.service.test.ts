import { describe, it, expect, vi } from 'vitest';

const get = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/lib/api-client', () => ({
  apiClient: { get: (...args: unknown[]) => get(...args), post: vi.fn(), patch: vi.fn() },
}));

const { listTeamPresets } = await import('../teamPresets.service');

describe('listTeamPresets', () => {
  it('fills a missing roles list, number or string so a row never crashes a render', async () => {
    get.mockResolvedValue({ data: { success: true, data: [{ id: 4, name: 'Bare' }] } });
    const [row] = await listTeamPresets();
    expect(row).toMatchObject({
      id: 4,
      name: 'Bare',
      key: '',
      description: '',
      roles: [],
      itemCount: 0,
      retiredCount: 0,
      flowCounts: {},
      active: false,
    });
    expect(() => row.roles.map(String)).not.toThrow();
  });
});
