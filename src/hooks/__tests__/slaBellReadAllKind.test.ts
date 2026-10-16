/**
 * #957 R23 — `notification:read-all` echoes `{ kind }` for a kind-filtered call. A personal
 * work-alert read-all (assigned / new unassigned) must not zero the SLA bell's unread count.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const get = vi.fn<(url: string) => Promise<unknown>>();
const handlers = vi.hoisted(() => new Map<string, (data?: unknown) => void>());
vi.mock('@/lib/api-client', () => ({
  apiClient: { get: (url: string) => get(url), patch: () => Promise.resolve({ data: {} }) },
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

const breach = {
  id: 1,
  kind: 'sla_message_breach',
  entityType: 'message',
  entityId: 101,
  organizationId: 4,
  severity: 'warning',
  breachAmount: 5,
  createdAt: '2026-09-09T13:00:00.000Z',
  readAt: null,
  isRead: false,
  details: {},
};

beforeEach(() => {
  vi.clearAllMocks();
  handlers.clear();
  get.mockResolvedValue({ data: { data: { notifications: [breach], total: 1 } } });
});

const mount = async () => {
  const hook = renderHook(() => useSLANotifications());
  await waitFor(() => expect(hook.result.current.notifications).toHaveLength(1));
  expect(hook.result.current.unreadCount).toBe(1);
  return hook;
};

describe('SLA bell read-all (R23)', () => {
  it.each(['conversation_assigned', 'new_unassigned_message'])(
    'ignores a read-all for %s',
    async (kind) => {
      const { result } = await mount();
      act(() => handlers.get('notification:read-all')?.({ kind }));
      expect(result.current.unreadCount).toBe(1);
      expect(result.current.notifications[0].isRead).toBe(false);
    }
  );

  it('CONTROL: an unfiltered read-all still zeroes the bell', async () => {
    const { result } = await mount();
    act(() => handlers.get('notification:read-all')?.({}));
    expect(result.current.unreadCount).toBe(0);
  });

  it('CONTROL: a payload-less read-all still zeroes the bell', async () => {
    const { result } = await mount();
    act(() => handlers.get('notification:read-all')?.());
    expect(result.current.unreadCount).toBe(0);
  });
});
