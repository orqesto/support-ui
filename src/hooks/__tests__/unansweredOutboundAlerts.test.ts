/**
 * The push surface for "a message did not reach the person who should have seen it".
 *
 * Why it exists rather than a page: the rows this covers were previously hidden in a
 * global-admin-only lens, and that is how a chargeback negotiation and a delivery claim sat
 * unowned for two days on a live workspace. A surface you must REMEMBER to open does not get
 * opened — the KB review queue in this product has been used 0 times out of 204.
 *
 * ⚠️ The quiet way a hook like this fails is clearing standing alerts on a failed poll, which
 * reads as "nothing is unowned any more" — the same false all-clear the KB and AI-provider
 * hooks guard against, for the same reason.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

type GetConfig = { params?: { kind?: string } };
// Forwards the CONFIG, not just the url. The kind now travels in `params`, and a mock that
// drops the second argument cannot tell a kind-scoped request from the unfiltered one — so a
// typo in `params` would ship green.
const get = vi.fn<(url: string, config?: GetConfig) => Promise<unknown>>();
const patch = vi.fn<(url: string) => Promise<unknown>>(() => Promise.resolve({ data: {} }));

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (url: string, config?: GetConfig) => get(url, config),
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
    selector({ selectedOrganizationId: 4, user: { organizationId: 4 } }),
}));

const { useUnansweredOutboundAlerts } = await import('../useUnansweredOutboundAlerts');

const row = (over: Record<string, unknown> = {}) => ({
  id: 1,
  kind: 'one_sided_outbound',
  entityType: 'message',
  entityId: 11822,
  organizationId: 4,
  severity: null,
  createdAt: '2026-09-09T13:10:00.000Z',
  details: {},
  ...over,
});

const respond = (notifications: unknown[]) =>
  get.mockResolvedValue({ data: { data: { notifications, total: notifications.length } } });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useUnansweredOutboundAlerts', () => {
  it('surfaces a one-sided outbound thread', async () => {
    respond([row()]);
    const { result } = renderHook(() => useUnansweredOutboundAlerts());
    await waitFor(() => expect(result.current.alerts).toHaveLength(1));
    expect(result.current.alerts[0]).toMatchObject({
      kind: 'one_sided_outbound',
      entityId: 11822,
    });
  });

  it('asks for its own kinds, so a busy workspace cannot push them past the 20-row cap', async () => {
    // MEASURED on the taco client box, 2026-09-10, v1.1.268. CoreSarms holds 165
    // notifications and `GET /api/notifications` serves the newest 20 across ALL kinds with
    // `hasMore: true`. The three one-sided alerts raised at 12:03Z sat at positions 2-4 of
    // that window, and a new SLA breach landed at 12:38Z. Once ~17 more arrive the outbound
    // rows leave the payload entirely, `alerts` is empty, `UnansweredOutboundSection` returns
    // null, and these alerts reach the user on ZERO surfaces — which is verbatim the failure
    // this hook's own header says it exists to prevent. Visibility with a one-day
    // shelf life is not visibility.
    //
    // So the fetch must name its kinds. The endpoint supports `?kind=` and applies it to
    // `total`/`hasMore` too, giving each kind its own 20 slots instead of making them
    // compete with a breach feed that never stops.
    const breach = (id: number) => row({ id, kind: 'sla_message_breach' });
    get.mockImplementation((_url: string, config?: GetConfig) =>
      Promise.resolve({
        data: {
          data:
            config?.params?.kind === 'one_sided_outbound'
              ? { notifications: [row()], total: 1, hasMore: false }
              : config?.params?.kind
                ? { notifications: [], total: 0, hasMore: false }
                : // The unfiltered call as a busy workspace really answers it: 20 breaches,
                  // not one outbound row in sight, and 145 more behind them.
                  {
                    notifications: Array.from({ length: 20 }, (_, index) => breach(100 + index)),
                    total: 165,
                    hasMore: true,
                  },
        },
      }),
    );
    const { result } = renderHook(() => useUnansweredOutboundAlerts());
    await waitFor(() => expect(result.current.alerts).toHaveLength(1));
    expect(result.current.alerts[0]).toMatchObject({ kind: 'one_sided_outbound' });
    // Wiring, not just outcome: both kinds are asked for by name. Without this an unfiltered
    // call that happened to contain the row would satisfy the assertion above.
    expect(get).toHaveBeenCalledWith('/api/notifications', {
      params: { kind: 'one_sided_outbound' },
    });
    expect(get).toHaveBeenCalledWith('/api/notifications', {
      params: { kind: 'customer_reply_in_spam' },
    });
  });

  it('surfaces a spam-recovered reply with its count', async () => {
    respond([
      row({
        id: 2,
        kind: 'customer_reply_in_spam',
        entityType: 'message_source',
        entityId: 34,
        details: { recovered: 3 },
      }),
    ]);
    const { result } = renderHook(() => useUnansweredOutboundAlerts());
    await waitFor(() => expect(result.current.alerts).toHaveLength(1));
    expect(result.current.alerts[0]).toMatchObject({ entityId: 34, recovered: 3 });
  });

  it('puts the urgent kind first, because only the first few are ever shown', async () => {
    // The panel renders PANEL_PEEK_LIMIT rows and the API returns newest-first. Without a sort
    // an urgent `customer_reply_in_spam` — a live mailbox filter eating customer replies, the
    // one of the two kinds that is a genuine fault — can sit below five one-sided rows from
    // this morning's sweep, counted in the bell but visible nowhere.
    // Newest-first, as the endpoint actually returns them (`ORDER BY created_at DESC`, and id
    // is a serial so it moves with it). The previous fixture was [10, 11, 3] — not newest-first
    // in any order — so a reader checking the stated premise against it found it unsupported.
    respond([
      row({ id: 11, kind: 'one_sided_outbound' }),
      row({ id: 10, kind: 'one_sided_outbound' }),
      row({ id: 3, kind: 'customer_reply_in_spam', entityType: 'message_source', details: { recovered: 2 } }),
    ]);
    const { result } = renderHook(() => useUnansweredOutboundAlerts());
    await waitFor(() => expect(result.current.alerts).toHaveLength(3));

    expect(result.current.alerts[0].kind).toBe('customer_reply_in_spam');
    // …and within a kind, newest first, so the ordering is fully determined rather than
    // whatever the API happened to return.
    expect(result.current.alerts.slice(1).map((alert) => alert.id)).toEqual([11, 10]);
  });

  it('ignores unrelated notification kinds', async () => {
    // Control: proves the filter is doing work rather than passing everything through.
    respond([row({ kind: 'kb_document_stale' }), row({ id: 9, kind: 'sla_message_breach' })]);
    const { result } = renderHook(() => useUnansweredOutboundAlerts());
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(result.current.alerts).toHaveLength(0);
  });

  it('does NOT clear standing alerts when a poll fails', async () => {
    respond([row()]);
    const { result } = renderHook(() => useUnansweredOutboundAlerts());
    await waitFor(() => expect(result.current.alerts).toHaveLength(1));

    // A fetch error is not evidence that the work got done.
    //
    // `mockRejectedValueOnce` fails exactly ONE of the two kind requests, so this is the
    // PARTIAL failure: one kind answered, the other did not. `Promise.all` rejects, the
    // `.catch()` keeps what is on screen, and the alerts survive. Resolving partially here
    // would drop the failed kind's standing rows and read as "nothing is unowned any more".
    get.mockRejectedValueOnce(new Error('network'));
    act(() => {
      result.current.refresh();
    });
    // Two per poll now — one per kind — so the mount and the refresh are four.
    await waitFor(() => expect(get).toHaveBeenCalledTimes(4));
    expect(result.current.alerts).toHaveLength(1);
  });

  it('dismiss removes the row locally and tells the server', async () => {
    respond([row()]);
    const { result } = renderHook(() => useUnansweredOutboundAlerts());
    await waitFor(() => expect(result.current.alerts).toHaveLength(1));
    act(() => {
      result.current.dismiss(1);
    });
    expect(result.current.alerts).toHaveLength(0);
    expect(patch).toHaveBeenCalledWith('/api/notifications/1/dismiss');
  });
});
