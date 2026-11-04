import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const get = vi.fn<(url: string) => Promise<unknown>>();
const put = vi.fn<(url: string, body: unknown) => Promise<unknown>>();
vi.mock('@/lib/api-client', () => ({
  apiClient: { get: (url: string) => get(url), put: (url: string, body: unknown) => put(url, body), patch: () => Promise.resolve({ data: {} }) },
}));
vi.mock('@/lib/socketManager', () => ({
  getSocket: () => ({}),
  releaseSocket: () => {},
  subscribeToEvent: () => {},
  unsubscribeFromEvent: () => {},
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ selectedOrganizationId: 4, user: { organizationId: 4, role: 'admin' } }),
}));

const { useSLANotifications } = await import('../useSLANotifications');
const { apiError } = await import('@/test/apiError');

const only = (locked: boolean) => ({
  key: 'onlyAssignedToMe', value: false, default: false, source: locked ? 'locked' : 'own', locked, alwaysOn: false,
});
const arrange = (locked: boolean) => {
  get.mockImplementation((url: string) =>
    url === '/api/notifications'
      ? Promise.resolve({ data: { data: { notifications: [], total: 0 } } })
      : Promise.resolve({ data: { data: { role: 'support', lines: [only(locked)] } } })
  );
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('bell "Only mine" and admin locks', () => {
  it('a locked line is reported locked and a click sends nothing', async () => {
    arrange(true);
    const { result } = renderHook(() => useSLANotifications());
    await waitFor(() => expect(result.current.onlyMineLocked).toBe(true));
    act(() => result.current.setOnlyMine(true));
    expect(put).not.toHaveBeenCalled();
    expect(result.current.onlyAssignedToMe).toBe(false);
  });

  it('a 409 anyway reverts and says why', async () => {
    arrange(false);
    put.mockRejectedValue(await apiError(409, { code: 'LINE_LOCKED', keys: ['onlyAssignedToMe'], fields: ['onlyAssignedToMe'] }));
    const { result } = renderHook(() => useSLANotifications());
    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/users/me/notification-settings'));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    act(() => result.current.setOnlyMine(true));
    await waitFor(() => expect(result.current.onlyMineNotice).toMatch(/Set by your admin/));
    expect(result.current.onlyAssignedToMe).toBe(false);
    expect(result.current.onlyMineLocked).toBe(true);
  });

  it('CONTROL: an unlocked line saves', async () => {
    arrange(false);
    put.mockResolvedValue({ data: {} });
    const { result } = renderHook(() => useSLANotifications());
    await waitFor(() => expect(result.current.onlyMineLocked).toBe(false));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    act(() => result.current.setOnlyMine(true));
    expect(put).toHaveBeenCalledTimes(1);
    expect(result.current.onlyAssignedToMe).toBe(true);
  });
});
