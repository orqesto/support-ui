import { describe, it, expect, vi, beforeEach } from 'vitest';

const get = vi.fn();
vi.mock('@/lib/api-client', () => ({ apiClient: { get } }));

const { customApiService } = await import('../customApi.service');

/** A connection as an OLDER backend sends it: the endpoint carries no `templateKey`. */
const olderConnection = (endpoint: Record<string, unknown>) => ({
  id: 1,
  name: 'Shop',
  baseUrl: 'https://shop.example',
  endpoints: [{ id: 9, connectionId: 1, label: 'Orders', path: '/orders', ...endpoint }],
});

beforeEach(() => {
  get.mockReset();
});

describe('customApiService.list — normaliseEndpoint (F5)', () => {
  it('defaults templateKey to null when an older backend sends none', async () => {
    get.mockResolvedValue({ data: { success: true, data: [olderConnection({})] } });
    const [connection] = await customApiService.list();
    expect(connection?.endpoints[0]?.templateKey).toBeNull();
    expect(get).toHaveBeenCalledWith('/api/custom-apis');
  });

  it('POSITIVE CONTROL: keeps the templateKey a newer backend sends', async () => {
    get.mockResolvedValue({
      data: { success: true, data: [olderConnection({ templateKey: 'order_tracking' })] },
    });
    const [connection] = await customApiService.list();
    expect(connection?.endpoints[0]?.templateKey).toBe('order_tracking');
  });
});

describe('customApiService.list — 2026-10-14 fields', () => {
  it('an older backend: referenceLabel null, health absent', async () => {
    get.mockResolvedValue({ data: { success: true, data: [olderConnection({})] } });
    const [connection] = await customApiService.list();
    expect(connection?.endpoints[0]?.referenceLabel).toBeNull();
    expect(connection?.endpoints[0]?.health).toBeUndefined();
  });

  it('POSITIVE CONTROL: keeps what a newer backend sends', async () => {
    const health = { latest: 'ok', dot: 'green', noMatchStreak: 0 };
    get.mockResolvedValue({
      data: { success: true, data: [olderConnection({ referenceLabel: 'User id', health })] },
    });
    const [connection] = await customApiService.list();
    expect(connection?.endpoints[0]?.referenceLabel).toBe('User id');
    expect(connection?.endpoints[0]?.health).toEqual(health);
  });
});
