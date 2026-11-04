/**
 * The bell reads the effective notification lines (one request, via the settings service):
 * an SLA message breach whose line is OFF is dropped on the socket path; an old backend
 * (404 on the new endpoint) keeps today's legacy behaviour.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const get = vi.fn<(url: string) => Promise<unknown>>();
const handlers = vi.hoisted(() => new Map<string, (data?: unknown) => void>());
vi.mock('@/lib/api-client', () => ({
  apiClient: { get: (url: string) => get(url), patch: () => Promise.resolve({ data: {} }), put: vi.fn() },
}));
vi.mock('@/lib/socketManager', () => ({
  getSocket: () => ({}),
  releaseSocket: () => {},
  subscribeToEvent: (event: string, handler: (data?: unknown) => void) => {
    handlers.set(event, handler);
  },
  unsubscribeFromEvent: (event: string) => {
    handlers.delete(event);
  },
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ selectedOrganizationId: 4, user: { organizationId: 4, role: 'admin' } }),
}));

const { useSLANotifications } = await import('../useSLANotifications');
const { apiError } = await import('@/test/apiError');
const { invalidateSharedFetch } = await import('@/lib/sharedFetch');

const line = (key: string, value: unknown) => ({
  key, value, default: value, source: 'own', locked: false, alwaysOn: false,
});
const incoming = {
  id: 9, kind: 'sla_message_breach', type: 'message', entityId: 1, organizationId: 4,
  severity: 'warning', breachAmount: 3, details: {}, createdAt: '2026-11-04T10:00:00.000Z', isRead: false,
};

const setup = (settings: () => Promise<unknown>, calls: string[] = []) => {
  invalidateSharedFetch();
  get.mockImplementation((url: string) => {
    calls.push(url);
    if (url === '/api/notifications') return Promise.resolve({ data: { data: { notifications: [], total: 0 } } });
    return settings();
  });
};

const deliver = async (waitFor2?: string) => {
  const hook = renderHook(() => useSLANotifications());
  await waitFor(() => expect(get).toHaveBeenCalledWith('/api/users/me/notification-settings'));
  if (waitFor2) await waitFor(() => expect(get).toHaveBeenCalledWith(waitFor2));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  act(() => handlers.get('sla_breach')?.(incoming));
  return hook;
};

beforeEach(() => {
  vi.clearAllMocks();
  handlers.clear();
});

describe('bell honours effective lines', () => {
  it('drops a message breach when kind:sla_message_breach is OFF', async () => {
    setup(() => Promise.resolve({ data: { data: { role: 'support', lines: [line('kind:sla_message_breach', false)] } } }));
    const { result } = await deliver();
    expect(result.current.notifications.filter((row) => row.id === 9)).toHaveLength(0);
  });

  it('CONTROL: shows it when the line is ON', async () => {
    setup(() => Promise.resolve({ data: { data: { role: 'support', lines: [line('kind:sla_message_breach', true)] } } }));
    const { result } = await deliver();
    expect(result.current.notifications.filter((row) => row.id === 9)).toHaveLength(1);
  });

  it('old backend (404 then legacy) keeps today behaviour and asks once each', async () => {
    const calls: string[] = [];
    setup(async () => {
      const url = calls[calls.length - 1];
      if (url === '/api/users/me/notification-settings') throw await apiError(404, {});
      return { data: { data: { notifyMessages: true, minSeverity: 'warning' } } };
    }, calls);
    const { result } = await deliver('/api/users/me/notification-preferences');
    expect(result.current.notifications.filter((row) => row.id === 9)).toHaveLength(1);
    expect(calls.filter((url) => url.includes('notification-settings'))).toHaveLength(1);
    expect(calls.filter((url) => url.includes('notification-preferences'))).toHaveLength(1);
  });
});
