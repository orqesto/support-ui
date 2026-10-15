// src/hooks/__tests__/useWorkAlerts.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

type Config = { params?: { kind?: string } };
const get = vi.fn<(url: string, config?: Config) => Promise<unknown>>();
const patch = vi.fn<(url: string, body?: unknown, config?: Config) => Promise<unknown>>(() =>
  Promise.resolve({ data: {} })
);
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (url: string, config?: Config) => get(url, config),
    patch: (url: string, body?: unknown, config?: Config) => patch(url, body, config),
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
    selector({ selectedOrganizationId: 21, user: { organizationId: 21 } }),
}));
const dept = vi.hoisted(() => ({ key: '' }));
vi.mock('@/hooks/useDepartmentContextKey', () => ({ useDepartmentContextKey: () => dept.key }));

const {
  useWorkAlerts,
  workAlertText,
  workAlertHref,
  workAlertTypeLabel,
  toWorkAlert,
  WORK_ALERTS_REFRESH_MS,
} = await import('../useWorkAlerts');

const assigned = {
  id: 1,
  kind: 'conversation_assigned',
  entityType: 'conversation',
  entityId: 50,
  organizationId: 21,
  assigneeId: 7,
  departmentId: 3,
  severity: null,
  breachAmount: null,
  dismissedAt: null,
  createdAt: '2026-10-15T10:00:00Z',
  isRead: false,
  details: { subject: 'Refund', actor: { userId: 5, label: 'Anna Agent' }, eventId: null },
};
const unassigned = {
  ...assigned,
  id: 2,
  kind: 'new_unassigned_message',
  entityId: 51,
  assigneeId: null,
  isRead: true,
  details: {
    subject: 'Where is my order',
    actor: { userId: null, label: 'New mail' },
    eventId: 900,
    departmentName: 'Support',
  },
};
const byKind = (rows: unknown[]) =>
  get.mockImplementation((_url, config) =>
    Promise.resolve({
      data: {
        data: {
          notifications: rows.filter(
            (row) => (row as { kind: string }).kind === config?.params?.kind
          ),
          total: 0,
          hasMore: false,
        },
      },
    })
  );
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
  vi.clearAllMocks();
  handlers.clear();
  dept.key = '';
});

describe('work alert text (#957 §3.7, verbatim copy)', () => {
  it('assigned', () => {
    expect(workAlertText(toWorkAlert(assigned as never))).toBe(
      'Assigned to you by Anna Agent — Refund'
    );
  });
  it('new unassigned', () => {
    expect(workAlertText(toWorkAlert(unassigned as never))).toBe(
      'New unassigned message in Support — Where is my order'
    );
  });
  it('needs routing (no department) and no subject', () => {
    const row = { ...unassigned, details: { eventId: 1 } };
    expect(workAlertText(toWorkAlert(row as never))).toBe(
      'New unassigned message in Needs routing — (no subject)'
    );
  });
  it('opens the conversation, or the ticket', () => {
    expect(workAlertHref(toWorkAlert(assigned as never))).toBe('/messages/50');
    expect(
      workAlertHref(toWorkAlert({ ...assigned, entityType: 'ticket', entityId: 9 } as never))
    ).toBe('/tickets/9');
  });
  it('type labels', () => {
    expect(workAlertTypeLabel('conversation_assigned')).toBe('Assigned to you');
    expect(workAlertTypeLabel('new_unassigned_message')).toBe('New unassigned');
  });
});

describe('useWorkAlerts', () => {
  it('asks for each kind BY NAME (the unfiltered list no longer carries them, BE R18) and counts the unread ones', async () => {
    byKind([assigned, unassigned]);
    const { result } = renderHook(() => useWorkAlerts());
    await waitFor(() => expect(result.current.alerts).toHaveLength(2));
    expect(get.mock.calls.map(([, config]) => config?.params?.kind).sort()).toEqual([
      'conversation_assigned',
      'new_unassigned_message',
    ]);
    expect(result.current.unread).toBe(1);
  });

  it.each([
    'notification:new',
    'notification:resolved',
    'notification:updated',
    'notification:removed',
    'notification:read',
    'notification:read-all',
    'conversation:routed',
  ])('refetches on %s', async (event) => {
    byKind([]);
    renderHook(() => useWorkAlerts());
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    act(() => handlers.get(event)?.());
    await waitFor(() => expect(get).toHaveBeenCalledTimes(4));
  });

  it('R15: a burst of pings (a bulk assignment) costs ONE refetch, not one per ping', async () => {
    byKind([]);
    renderHook(() => useWorkAlerts());
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    act(() => {
      for (let index = 0; index < 5; index += 1) handlers.get('notification:new')?.();
    });
    await sleep(WORK_ALERTS_REFRESH_MS + 300);
    expect(get).toHaveBeenCalledTimes(4);
  });

  it('a ping that names another kind is not ours (no refetch); one naming ours is', async () => {
    byKind([]);
    renderHook(() => useWorkAlerts());
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    act(() => handlers.get('notification:new')?.({ kind: 'sla_message_breach', id: 9 }));
    await sleep(WORK_ALERTS_REFRESH_MS + 300);
    expect(get).toHaveBeenCalledTimes(2);
    act(() => handlers.get('notification:read-all')?.({ kind: 'new_unassigned_message' }));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(4));
  });

  it('a department-context switch refetches in the new scope (as the SLA bell does)', async () => {
    byKind([]);
    const { rerender } = renderHook(() => useWorkAlerts());
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    dept.key = '7';
    rerender();
    await waitFor(() => expect(get).toHaveBeenCalledTimes(4));
  });

  it('dismiss removes the row at once and PATCHes the personal dismiss', async () => {
    byKind([assigned]);
    const { result } = renderHook(() => useWorkAlerts());
    await waitFor(() => expect(result.current.alerts).toHaveLength(1));
    act(() => result.current.dismiss(1));
    expect(result.current.alerts).toEqual([]);
    expect(patch).toHaveBeenCalledWith('/api/notifications/1/dismiss', undefined, undefined);
  });

  it('clearAll dismisses each kind BY NAME (per user, BE R18) and empties the list', async () => {
    byKind([assigned, unassigned]);
    const { result } = renderHook(() => useWorkAlerts());
    await waitFor(() => expect(result.current.alerts).toHaveLength(2));
    await act(async () => {
      await result.current.clearAll();
    });
    expect(result.current.alerts).toEqual([]);
    expect(patch.mock.calls.map(([url, , config]) => [url, config?.params?.kind]).sort()).toEqual([
      ['/api/notifications/dismiss-all', 'conversation_assigned'],
      ['/api/notifications/dismiss-all', 'new_unassigned_message'],
    ]);
  });

  it('markAllRead marks each kind read BY NAME and zeroes the unread count', async () => {
    byKind([assigned]);
    const { result } = renderHook(() => useWorkAlerts());
    await waitFor(() => expect(result.current.unread).toBe(1));
    act(() => result.current.markAllRead());
    expect(result.current.unread).toBe(0);
    expect(patch.mock.calls.map(([url, , config]) => [url, config?.params?.kind]).sort()).toEqual([
      ['/api/notifications/read-all', 'conversation_assigned'],
      ['/api/notifications/read-all', 'new_unassigned_message'],
    ]);
  });

  it('dismiss with a 500: the row comes back after the resync', async () => {
    byKind([assigned]);
    const { result } = renderHook(() => useWorkAlerts());
    await waitFor(() => expect(result.current.alerts).toHaveLength(1));
    patch.mockRejectedValueOnce({ status: 500 });
    act(() => result.current.dismiss(1));
    expect(result.current.alerts).toEqual([]);
    await waitFor(() => expect(result.current.alerts).toHaveLength(1));
  });

  it('dismiss with a 404 (a repeat dismiss): the row stays gone (resynced as a success)', async () => {
    byKind([assigned]);
    const { result } = renderHook(() => useWorkAlerts());
    await waitFor(() => expect(result.current.alerts).toHaveLength(1));
    byKind([]); // the server no longer holds it
    patch.mockRejectedValueOnce({ status: 404 });
    act(() => result.current.dismiss(1));
    await sleep(50);
    expect(result.current.alerts).toEqual([]);
  });

  it('clearAll with a 500: the list is refetched and the rows come back', async () => {
    byKind([assigned, unassigned]);
    const { result } = renderHook(() => useWorkAlerts());
    await waitFor(() => expect(result.current.alerts).toHaveLength(2));
    patch.mockRejectedValueOnce({ status: 500 });
    await act(async () => {
      await result.current.clearAll();
    });
    await waitFor(() => expect(result.current.alerts).toHaveLength(2));
  });

  it('open and markAllRead with a failure: resync from the server', async () => {
    byKind([assigned]);
    const { result } = renderHook(() => useWorkAlerts());
    await waitFor(() => expect(result.current.unread).toBe(1));
    patch.mockRejectedValueOnce(new Error('offline'));
    act(() => result.current.open(result.current.alerts[0]));
    await waitFor(() => expect(result.current.unread).toBe(1));
    patch.mockRejectedValueOnce(new Error('offline'));
    act(() => result.current.markAllRead());
    await waitFor(() => expect(result.current.unread).toBe(1));
  });

  it('open marks the row read', async () => {
    byKind([assigned]);
    const { result } = renderHook(() => useWorkAlerts());
    await waitFor(() => expect(result.current.alerts).toHaveLength(1));
    act(() => result.current.open(result.current.alerts[0]));
    expect(patch).toHaveBeenCalledWith('/api/notifications/1/read', undefined, undefined);
    expect(result.current.unread).toBe(0);
  });

  it('a failed poll keeps the standing alerts (no false all-clear)', async () => {
    byKind([assigned]);
    const { result } = renderHook(() => useWorkAlerts());
    await waitFor(() => expect(result.current.alerts).toHaveLength(1));
    get.mockRejectedValue(new Error('offline'));
    act(() => result.current.refresh());
    await sleep(0);
    expect(result.current.alerts).toHaveLength(1);
  });

  it('CONTROL: rows of other kinds in a response are ignored', async () => {
    get.mockResolvedValue({
      data: {
        data: {
          notifications: [{ ...assigned, kind: 'sla_message_breach' }],
          total: 1,
          hasMore: false,
        },
      },
    });
    const { result } = renderHook(() => useWorkAlerts());
    await sleep(0);
    expect(result.current.alerts).toEqual([]);
  });
});

describe('final review fixes (#957)', () => {
  it('lists by createdAt, newest first: a re-raised row keeps its id but gets a newer createdAt', async () => {
    const oldId = { ...assigned, id: 1, createdAt: '2026-10-15T12:00:00Z' };
    const newerCreatedAt = { ...assigned, id: 9, createdAt: '2026-10-15T09:00:00Z' };
    const tieLowId = { ...assigned, id: 3, createdAt: '2026-10-15T09:00:00Z' };
    byKind([newerCreatedAt, oldId, tieLowId]);
    const { result } = renderHook(() => useWorkAlerts());
    await waitFor(() => expect(result.current.alerts).toHaveLength(3));
    expect(result.current.alerts.map((alert) => alert.id)).toEqual([1, 9, 3]);
  });

  it('out-of-order responses: the later request wins, an earlier answer arriving late is dropped', async () => {
    byKind([]);
    const { result } = renderHook(() => useWorkAlerts());
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    get.mockReset();
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    const page = (rows: unknown[]) => ({
      data: { data: { notifications: rows, total: rows.length, hasMore: false } },
    });
    // request 1 (both kinds) then request 2 (both kinds)
    get
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
      .mockImplementationOnce(() => second.promise);
    act(() => {
      result.current.refresh();
      result.current.refresh();
    });
    await act(async () => {
      second.resolve(page([]));
      await sleep(0);
    });
    await act(async () => {
      first.resolve(page([assigned]));
      await sleep(0);
    });
    expect(result.current.alerts).toEqual([]);
  });

  it('total: "+N more" counts the server total per kind, not just the loaded rows', async () => {
    get.mockImplementation((_url, config) =>
      Promise.resolve({
        data: {
          data: {
            notifications:
              config?.params?.kind === 'conversation_assigned' ? [assigned] : [],
            total: config?.params?.kind === 'conversation_assigned' ? 37 : 4,
            hasMore: true,
          },
        },
      })
    );
    const { result } = renderHook(() => useWorkAlerts());
    await waitFor(() => expect(result.current.alerts).toHaveLength(1));
    expect(result.current.total).toBe(41);
  });

  it('CONTROL: a total below the loaded rows (older backend) never undercounts', async () => {
    byKind([assigned, unassigned]);
    const { result } = renderHook(() => useWorkAlerts());
    await waitFor(() => expect(result.current.alerts).toHaveLength(2));
    expect(result.current.total).toBe(2);
  });

  it('a refetch started before a dismiss cannot bring the dismissed row back', async () => {
    byKind([assigned]);
    const { result } = renderHook(() => useWorkAlerts());
    await waitFor(() => expect(result.current.alerts).toHaveLength(1));
    const stale = deferred<unknown>();
    get.mockImplementationOnce(() => stale.promise).mockImplementationOnce(() => stale.promise);
    act(() => result.current.refresh());
    byKind([]); // the server, once the dismiss has answered
    act(() => result.current.dismiss(1));
    await act(async () => {
      stale.resolve({
        data: { data: { notifications: [assigned], total: 1, hasMore: false } },
      });
      await sleep(0);
    });
    expect(result.current.alerts).toEqual([]);
  });

  it('a refetch dropped by a dismiss still lands: after the dismiss settles the new alert is listed', async () => {
    byKind([assigned]);
    const { result } = renderHook(() => useWorkAlerts());
    await waitFor(() => expect(result.current.alerts).toHaveLength(1));
    const fresh = { ...unassigned, id: 8, isRead: false, createdAt: '2026-10-15T11:00:00Z' };
    const inFlight = deferred<unknown>();
    get.mockImplementationOnce(() => inFlight.promise).mockImplementationOnce(() => inFlight.promise);
    act(() => result.current.refresh());
    byKind([assigned, fresh]); // what the server holds once the dismiss PATCH has answered (assigned stays)
    act(() => result.current.dismiss(1));
    await act(async () => {
      inFlight.resolve({ data: { data: { notifications: [], total: 0, hasMore: false } } });
      await sleep(0);
    });
    await waitFor(() => expect(result.current.alerts.map((alert) => alert.id)).toContain(8));
  });

  it('a 404 on dismiss (already gone) resyncs too', async () => {
    byKind([assigned]);
    const { result } = renderHook(() => useWorkAlerts());
    await waitFor(() => expect(result.current.alerts).toHaveLength(1));
    const calls = get.mock.calls.length;
    patch.mockRejectedValueOnce({ status: 404 });
    act(() => result.current.dismiss(1));
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(calls));
  });
});
