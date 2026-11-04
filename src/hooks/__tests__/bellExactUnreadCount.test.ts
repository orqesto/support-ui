/**
 * The bell's unread number is the SERVER's exact count, not the unread rows on the 20-row page.
 *
 * Staging 2026-11-04, as a support user: an admin lock hid one kind, other rows took the page, and
 * the tab title went UP (13 → 20 with 10 actually unread); unlocked it read 15 with 18 unread. The
 * backend now sends `unreadTotal` (every visible unread row under the list's own rules) and the
 * SLA list honours `?excludeKinds=`. Each case below has more rows than the page, so a count taken
 * from the page gives another number — and each fallback case keeps an older backend working.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

type Config = { params?: { kind?: string; excludeKinds?: string } };
const get = vi.fn<(url: string, config?: Config) => Promise<unknown>>();
const patch = vi.fn<(url: string, body?: unknown, config?: Config) => Promise<unknown>>(() =>
  Promise.resolve({ data: {} })
);
vi.mock('@/services/notificationsByKind.service', async () => {
  const { apiClient } = await import('@/lib/api-client');
  return {
    fetchNotificationsOfKind: (kind: string) =>
      apiClient.get('/api/notifications', { params: { kind } }),
  };
});
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (url: string, config?: Config) => get(url, config),
    patch: (url: string, body?: unknown, config?: Config) => patch(url, body, config),
    put: () => Promise.resolve({ data: {} }),
  },
}));
const handlers = vi.hoisted(() => new Map<string, (data?: unknown) => void>());
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
    selector({ selectedOrganizationId: 4, user: { organizationId: 4, role: 'support' } }),
}));
vi.mock('@/hooks/useDepartmentContextKey', () => ({ useDepartmentContextKey: () => '' }));

const { useSLANotifications, SLA_BELL_EXCLUDE_KINDS, SLA_RECOUNT_MS } = await import(
  '../useSLANotifications'
);
const { useWorkAlerts } = await import('../useWorkAlerts');
const { announceNotificationSettingsChanged } = await import('../notificationPrefsKey');

const breach = (id: number, isRead: boolean, kind = 'sla_message_breach') => ({
  id,
  kind,
  entityType: 'message',
  entityId: 100 + id,
  organizationId: 4,
  severity: 'warning',
  breachAmount: 5,
  createdAt: '2026-10-01T10:00:00.000Z',
  isRead,
  details: {},
});
/** 20 rows, the first `readOnPage` read: the page alone says 20 - readOnPage. */
const page = (readOnPage: number) =>
  Array.from({ length: 20 }, (_, index) => breach(index + 1, index < readOnPage));

let slaPayload: Record<string, unknown> = {};
let byKind: Record<string, Record<string, unknown>> = {};
const listCalls = () =>
  get.mock.calls.filter(
    ([url, config]) => url === '/api/notifications' && config?.params?.kind === undefined
  );

beforeEach(() => {
  vi.clearAllMocks();
  handlers.clear();
  byKind = {};
  get.mockImplementation((url, config) => {
    if (url !== '/api/notifications') return Promise.reject(new Error(`unmocked ${url}`));
    const kind = config?.params?.kind;
    if (kind !== undefined) {
      return Promise.resolve({
        data: { data: byKind[kind] ?? { notifications: [], total: 0, hasMore: false } },
      });
    }
    return Promise.resolve({ data: { data: slaPayload } });
  });
});
afterEach(() => {
  vi.useRealTimers();
});

const mountSla = async (expectUnread: number) => {
  const hook = renderHook(() => useSLANotifications());
  await waitFor(() => expect(hook.result.current.unreadCount).toBe(expectUnread));
  return hook;
};

describe('SLA bell: the exact unread count', () => {
  it('asks the server to leave out every kind another section counts', async () => {
    slaPayload = { notifications: [breach(1, false)], total: 1, unreadTotal: 1, hasMore: false };
    await mountSla(1);
    expect(listCalls()[0][1]?.params?.excludeKinds).toBe(SLA_BELL_EXCLUDE_KINDS);
    for (const kind of ['spam_arrival', 'ai_provider_down', 'new_unassigned_message']) {
      expect(SLA_BELL_EXCLUDE_KINDS.split(',')).toContain(kind);
    }
    // The SLA kinds themselves are never excluded.
    expect(SLA_BELL_EXCLUDE_KINDS.split(',')).not.toContain('sla_message_breach');
  });

  it('more than 20 rows: the count is unreadTotal, not the page', async () => {
    slaPayload = { notifications: page(2), total: 40, unreadTotal: 37, hasMore: true };
    const { result } = await mountSla(37);
    // CONTROL: the page alone holds 18 unread — the number the bell used to show.
    expect(result.current.notifications.filter((row) => !row.isRead)).toHaveLength(18);
  });

  it('an older backend (no unreadTotal): the page count, as before', async () => {
    slaPayload = { notifications: page(2), total: 40, hasMore: true };
    await mountSla(18);
  });

  it('an older backend that ignored excludeKinds: other kinds are dropped and not counted', async () => {
    slaPayload = {
      notifications: [breach(1, false), breach(2, false, 'spam_arrival'), breach(3, true)],
      total: 3,
      hasMore: false,
    };
    const { result } = await mountSla(1);
    expect(result.current.notifications.map((row) => row.id)).toEqual([1, 3]);
  });

  it('unreadTotal is not trusted when the server sent rows of an excluded kind', async () => {
    // A server that sent the field but answered wider than asked: its count covers rows this
    // section does not own, so the page count is the safe one.
    slaPayload = {
      notifications: [breach(1, false), breach(2, false, 'spam_arrival')],
      total: 2,
      unreadTotal: 2,
      hasMore: false,
    };
    await mountSla(1);
  });

  it('+1 on a live breach, -1 on a read', async () => {
    slaPayload = { notifications: page(2), total: 40, unreadTotal: 37, hasMore: true };
    const { result } = await mountSla(37);
    act(() =>
      handlers.get('sla_breach')?.({
        ...breach(99, false),
        receivedAt: undefined,
        isRead: undefined,
      })
    );
    expect(result.current.unreadCount).toBe(38);
    act(() => result.current.markRead(5)); // an unread row on the page
    expect(result.current.unreadCount).toBe(37);
    expect(patch).toHaveBeenCalledWith('/api/notifications/5/read', undefined, undefined);
    // The read echo from another tab for a row on the page.
    act(() => handlers.get('notification:read')?.({ notificationId: 6 }));
    expect(result.current.unreadCount).toBe(36);
    // The self-echo of the first read does not count twice.
    act(() => handlers.get('notification:read')?.({ notificationId: 5 }));
    expect(result.current.unreadCount).toBe(36);
  });

  it('a read of a row beyond the page re-reads the count (once for a burst)', async () => {
    slaPayload = { notifications: page(2), total: 40, unreadTotal: 37, hasMore: true };
    const { result } = await mountSla(37);
    expect(listCalls()).toHaveLength(1);
    slaPayload = { ...slaPayload, unreadTotal: 35 };
    vi.useFakeTimers();
    act(() => {
      handlers.get('notification:read')?.({ notificationId: 501 });
      handlers.get('notification:read')?.({ notificationId: 502 });
    });
    expect(result.current.unreadCount).toBe(37); // nothing guessed
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SLA_RECOUNT_MS);
    });
    vi.useRealTimers();
    await waitFor(() => expect(result.current.unreadCount).toBe(35));
    expect(listCalls()).toHaveLength(2);
  });

  it('CONTROL: with every unread row on the page, an unknown read changes nothing and sends nothing', async () => {
    slaPayload = { notifications: page(2), total: 20, unreadTotal: 18, hasMore: false };
    const { result } = await mountSla(18);
    vi.useFakeTimers();
    act(() => handlers.get('notification:read')?.({ notificationId: 501 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SLA_RECOUNT_MS * 2);
    });
    vi.useRealTimers();
    expect(result.current.unreadCount).toBe(18);
    expect(listCalls()).toHaveLength(1);
  });

  it('mark-all-read is exact zero; a failed one puts the server count back', async () => {
    slaPayload = { notifications: page(2), total: 40, unreadTotal: 37, hasMore: true };
    const { result } = await mountSla(37);
    patch.mockRejectedValueOnce(new Error('offline'));
    act(() => result.current.markAllRead());
    await waitFor(() => expect(result.current.unreadCount).toBe(37));
    act(() => result.current.markAllRead());
    expect(result.current.unreadCount).toBe(0);
  });

  it('saved settings re-read the list (a kind off changes what counts)', async () => {
    slaPayload = { notifications: page(2), total: 40, unreadTotal: 37, hasMore: true };
    const { result } = await mountSla(37);
    slaPayload = { notifications: page(2), total: 25, unreadTotal: 22, hasMore: true };
    act(() => announceNotificationSettingsChanged());
    await waitFor(() => expect(result.current.unreadCount).toBe(22));
  });

  it('clear-all re-reads: rows the server keeps still count', async () => {
    slaPayload = { notifications: page(2), total: 40, unreadTotal: 37, hasMore: true };
    const { result } = await mountSla(37);
    slaPayload = { notifications: [breach(1, false)], total: 1, unreadTotal: 1, hasMore: false };
    await act(async () => {
      await result.current.clearAll();
    });
    await waitFor(() => expect(result.current.unreadCount).toBe(1));
  });
});

const personal = (id: number, kind: string, isRead: boolean) => ({
  ...breach(id, isRead, kind),
  entityType: 'conversation',
  severity: null,
  breachAmount: null,
  details: { subject: 'Order' },
});

describe('work alerts: the exact unread count per kind', () => {
  it('adds the unread rows beyond each kind page; an older backend counts the page', async () => {
    byKind.new_unassigned_message = {
      notifications: Array.from({ length: 20 }, (_, index) =>
        personal(index + 1, 'new_unassigned_message', index < 4)
      ),
      total: 30,
      unreadTotal: 24,
      hasMore: true,
    };
    byKind.conversation_assigned = {
      notifications: [personal(50, 'conversation_assigned', false)],
      total: 1,
      unreadTotal: 1,
      hasMore: false,
    };
    const { result } = renderHook(() => useWorkAlerts());
    await waitFor(() => expect(result.current.unread).toBe(25));
    // CONTROL: the loaded rows alone hold 17 unread.
    expect(result.current.alerts.filter((alert) => !alert.isRead)).toHaveLength(17);
    act(() => result.current.markAllRead());
    expect(result.current.unread).toBe(0);
  });

  it('older backend: the loaded unread rows', async () => {
    byKind.new_unassigned_message = {
      notifications: Array.from({ length: 20 }, (_, index) =>
        personal(index + 1, 'new_unassigned_message', index < 4)
      ),
      total: 30,
      hasMore: true,
    };
    const { result } = renderHook(() => useWorkAlerts());
    await waitFor(() => expect(result.current.alerts).toHaveLength(20));
    expect(result.current.unread).toBe(16);
  });
});
