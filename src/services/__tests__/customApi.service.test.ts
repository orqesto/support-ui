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
