/**
 * The push surface for "this mailbox stopped being polled".
 *
 * ⛔ 2026-09-17: a live client's Gmail poll was dead for 73 minutes. Queues healthy, zero
 * failed jobs, container healthy and never restarted, and `/api/health/status` said "ingestion
 * is not healthy … last polled 68 min ago" in plain English the whole time. Nothing read it; a
 * customer chasing a refund was the alerting mechanism.
 *
 * The failure modes tested hardest are the ones that would reproduce that silence:
 *   1. the alert never reaching the payload at all (the shared 20-row page crowd-out),
 *   2. a failed poll clearing standing alerts, which reads as "polling recovered", and
 *   3. `minutesSince: null` being flattened to 0, which files a mailbox that has NEVER worked
 *      as the mildest row in the list.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const get = vi.fn<(url: string, config?: unknown) => Promise<unknown>>();
const patch = vi.fn<(url: string) => Promise<unknown>>(() => Promise.resolve({ data: {} }));

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (url: string, config?: unknown) => get(url, config),
    patch: (url: string) => patch(url),
  },
}));
vi.mock('@/lib/socketManager', () => ({
  getSocket: () => null,
  releaseSocket: () => {},
  subscribeToEvent: () => {},
  unsubscribeFromEvent: () => {},
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ selectedOrganizationId: 1, user: { organizationId: 1 } }),
}));

const { useIngestionDarkAlerts } = await import('../useIngestionDarkAlerts');

/** Shaped as the backend publishes it — see `announceDarkMailboxes`. */
const darkRow = (over: Record<string, unknown> = {}) => ({
  id: 9001,
  kind: 'ingestion_dark',
  entityType: 'message_source',
  entityId: 34,
  severity: 'critical',
  details: {
    sourceName: 'Gmail-info@coresarms.info',
    minutesSince: 68,
    neverPolled: false,
    locked: false,
  },
  ...over,
});

const respond = (rows: unknown[]) =>
  get.mockResolvedValue({ data: { data: { notifications: rows, total: rows.length } } });

beforeEach(() => {
  vi.clearAllMocks();
  respond([]);
});

describe('useIngestionDarkAlerts', () => {
  it('asks the server for ONLY this kind', async () => {
    // ⛔ Not the shared page filtered client-side. `GET /api/notifications` serves the newest
    // 20 rows across all kinds, so on a workspace carrying 20 standing SLA breaches a dark
    // mailbox would be absent from the payload entirely and this section would render nothing
    // — reproducing the exact silence the alert exists to end.
    renderHook(() => useIngestionDarkAlerts());

    await waitFor(() => expect(get).toHaveBeenCalled());
    const config = get.mock.calls[0][1] as { params?: { kind?: string } } | undefined;
    expect(config?.params?.kind).toBe('ingestion_dark');
  });

  it('maps a dark mailbox row', async () => {
    respond([darkRow()]);

    const { result } = renderHook(() => useIngestionDarkAlerts());

    await waitFor(() => expect(result.current.alerts).toHaveLength(1));
    expect(result.current.alerts[0]).toMatchObject({
      messageSourceId: 34,
      mailbox: 'Gmail-info@coresarms.info',
      minutesSince: 68,
      neverPolled: false,
      locked: false,
      severity: 'critical',
    });
  });

  it('keeps `minutesSince: null` as null rather than flattening it to zero', async () => {
    // Null means the mailbox has NEVER polled — it has never worked at all, which is worse
    // than any elapsed time. Coercing it to 0 would render "0 minutes" and read as healthy.
    respond([
      darkRow({ details: { sourceName: 'New mailbox', minutesSince: null, neverPolled: true } }),
    ]);

    const { result } = renderHook(() => useIngestionDarkAlerts());

    await waitFor(() => expect(result.current.alerts).toHaveLength(1));
    expect(result.current.alerts[0].minutesSince).toBeNull();
    expect(result.current.alerts[0].neverPolled).toBe(true);
  });

  it('sorts a never-polled mailbox above the longest outage', async () => {
    respond([
      darkRow({ id: 1, entityId: 10, details: { sourceName: 'A', minutesSince: 6000 } }),
      darkRow({
        id: 2,
        entityId: 11,
        details: { sourceName: 'B', minutesSince: null, neverPolled: true },
      }),
    ]);

    const { result } = renderHook(() => useIngestionDarkAlerts());

    await waitFor(() => expect(result.current.alerts).toHaveLength(2));
    // Not a bigger number — a different kind of broken, and it goes first.
    expect(result.current.alerts[0].mailbox).toBe('B');
  });

  it('drops a row of another kind even if the server sends one', async () => {
    // Belt and braces: a server that ignored `?kind=` would otherwise hand this section every
    // kind in the bell, which is how a dark-mailbox panel starts showing SLA breaches.
    respond([darkRow(), { ...darkRow({ id: 2 }), kind: 'sla_message_breach' }]);

    const { result } = renderHook(() => useIngestionDarkAlerts());

    await waitFor(() => expect(result.current.alerts).toHaveLength(1));
  });

  it('does not clear standing alerts when a poll fails', async () => {
    // ⛔ An empty list would read as "polling recovered". A network error is not that.
    respond([darkRow()]);
    const { result } = renderHook(() => useIngestionDarkAlerts());
    await waitFor(() => expect(result.current.alerts).toHaveLength(1));

    get.mockRejectedValueOnce(new Error('network'));
    result.current.refresh();

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(result.current.alerts).toHaveLength(1);
  });
});
