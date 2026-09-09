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

const get = vi.fn<(url: string) => Promise<unknown>>();
const patch = vi.fn<(url: string) => Promise<unknown>>(() => Promise.resolve({ data: {} }));

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: (url: string) => get(url), patch: (url: string) => patch(url) },
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
    get.mockRejectedValueOnce(new Error('network'));
    act(() => {
      result.current.refresh();
    });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
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
