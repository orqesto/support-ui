/**
 * A live escalation of a row on the page, with one page open and never reloaded.
 *
 * Run A: loaded unread at warning, read from elsewhere (the `notification:read` echo: -1), then
 * the sweep escalated it to critical (the server clears read marks on an escalation, #1358).
 * Run B: the hook already holds the row at CRITICAL while the server's copy changed under it, and
 * the next delivery arrives at that same severity. It used to be dropped as a duplicate, leaving
 * the badge one too low with no request. A delivery at a severity the hook already holds means the
 * hook's copy is stale; only the server knows the count then: one coalesced re-read.
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

const { useSLANotifications, SLA_RECOUNT_MS } = await import('../useSLANotifications');

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

type Row = ReturnType<typeof breach>;
/** The server's answer for these rows: every row fits the page, so unreadTotal = unread rows. */
const answer = (rows: Row[]) => ({
  notifications: rows,
  total: rows.length,
  unreadTotal: rows.filter((row) => !row.isRead).length,
  hasMore: false,
});
/** 12 rows; row 1 (index 0) is the one that escalates, rows 2..11 are unread, row 12 read. */
const initialRows = (severity: 'warning' | 'critical'): Row[] =>
  Array.from({ length: 12 }, (_, index) => ({
    ...breach(index + 1, index === 11),
    severity: index === 0 ? severity : 'warning',
  }));
const withRow1 = (rows: Row[], change: Partial<Row>) =>
  rows.map((row) => (row.id === 1 ? { ...row, ...change } : row));

/** The read made outside this page (a raw PATCH): the server marks it, the user room gets the echo. */
const readFromElsewhere = (rows: Row[]) => {
  const next = withRow1(rows, { isRead: true });
  slaPayload = answer(next);
  act(() => handlers.get('notification:read')?.({ notificationId: 1, kind: 'sla_message_breach' }));
  return next;
};

/** Real time past the coalescing window: the timer was armed under real timers. */
const settle = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, SLA_RECOUNT_MS + 150));
  });
};

describe('SLA bell: a live escalation of a row on the page', () => {
  it('run B: a delivery at the severity the hook already holds re-reads once and shows the server count', async () => {
    let rows = initialRows('critical');
    slaPayload = answer(rows);
    const { result } = await mountSla(11);
    rows = readFromElsewhere(rows);
    expect(result.current.unreadCount).toBe(10);
    // Back to warning in the database with no event, then escalated again: the server drops the
    // read marks and delivers critical, which this hook already holds for row 1.
    rows = withRow1(rows, { isRead: false, severity: 'critical' });
    slaPayload = answer(rows);
    act(() => handlers.get('sla_breach')?.({ ...breach(1, false), severity: 'critical' }));
    await settle();
    await waitFor(() => expect(result.current.unreadCount).toBe(11));
    expect(listCalls()).toHaveLength(2); // the load + ONE re-read
    expect(result.current.notifications.find((row) => row.id === 1)?.isRead).toBe(false);
  });

  it('run A: unread at load, read elsewhere, then escalated: the server count, one re-read', async () => {
    let rows = initialRows('warning');
    slaPayload = answer(rows);
    const { result } = await mountSla(11);
    rows = readFromElsewhere(rows);
    expect(result.current.unreadCount).toBe(10);
    rows = withRow1(rows, { isRead: false, severity: 'critical' });
    slaPayload = answer(rows);
    act(() => handlers.get('sla_breach')?.({ ...breach(1, false), severity: 'critical' }));
    expect(result.current.unreadCount).toBe(11);
    await settle();
    expect(result.current.unreadCount).toBe(11);
    expect(listCalls()).toHaveLength(2);
  });

  it('a repeated delivery (a burst of the same event) still costs one re-read', async () => {
    const rows = initialRows('critical');
    slaPayload = answer(rows);
    const { result } = await mountSla(11);
    vi.useFakeTimers();
    act(() => {
      for (let count = 0; count < 3; count += 1) {
        handlers.get('sla_breach')?.({ ...breach(1, false), severity: 'critical' });
      }
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SLA_RECOUNT_MS * 2);
    });
    vi.useRealTimers();
    expect(listCalls()).toHaveLength(2);
    expect(result.current.unreadCount).toBe(11);
  });

  it("CONTROL: a delivery that does not match the reader's settings sends nothing", async () => {
    const rows = initialRows('critical');
    slaPayload = answer(rows);
    await mountSla(11);
    await settle();
    act(() => handlers.get('sla_breach')?.({ ...breach(1, false), kind: 'spam_arrival' }));
    await settle();
    expect(listCalls()).toHaveLength(1); // the load only: a page load costs what it did
  });
});
