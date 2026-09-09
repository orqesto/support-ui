/**
 * The SLA bell must not render kinds that own a surface elsewhere.
 *
 * The bell's kind filter is deliberately fail-OPEN — an unknown kind still shows, so a real
 * breach can never be hidden by a denylist. The price is that a kind WITHOUT its own surface
 * renders as an amber "breach" with no breach fields: a row that tells the reader nothing and
 * looks like a bug. `NON_SLA_BELL_KINDS` is what pays that price.
 *
 * ⛔ Asserted through the HOOK, not by string-matching the source. An earlier version of this
 * file read `useSLANotifications.ts` and checked the set literal contained the strings — which
 * would have stayed green if someone deleted the `!isNonSlaBellKind(...)` call that applies it.
 * The amber row IS the defect, so the test has to be able to see it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const get = vi.fn<(url: string) => Promise<unknown>>();

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: (url: string) => get(url), patch: () => Promise.resolve({ data: {} }) },
}));
vi.mock('@/lib/socketManager', () => ({
  getSocket: () => null,
  releaseSocket: () => {},
  subscribeToEvent: () => {},
  unsubscribeFromEvent: () => {},
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ selectedOrganizationId: 4, user: { organizationId: 4, role: 'admin' } }),
}));

const { useSLANotifications } = await import('../useSLANotifications');

const row = (id: number, kind: string) => ({
  id,
  kind,
  entityType: 'message',
  entityId: 100 + id,
  organizationId: 4,
  severity: 'warning',
  breachAmount: 5,
  createdAt: '2026-09-09T13:00:00.000Z',
  readAt: null,
  details: {},
});

const respond = (rows: unknown[]) =>
  get.mockResolvedValue({ data: { data: { notifications: rows, total: rows.length } } });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SLA bell kind filter', () => {
  it('does not surface one_sided_outbound as an SLA breach', async () => {
    respond([row(1, 'sla_message_breach'), row(2, 'one_sided_outbound')]);
    const { result } = renderHook(() => useSLANotifications());
    await waitFor(() => expect(result.current.notifications.length).toBeGreaterThan(0));

    expect(result.current.notifications.map((row) => row.id)).toEqual([1]);
  });

  it('does not surface customer_reply_in_spam as an SLA breach', async () => {
    respond([row(1, 'sla_message_breach'), row(3, 'customer_reply_in_spam')]);
    const { result } = renderHook(() => useSLANotifications());
    await waitFor(() => expect(result.current.notifications.length).toBeGreaterThan(0));

    expect(result.current.notifications.map((row) => row.id)).toEqual([1]);
  });

  it('still surfaces a real breach, so the filter is not simply eating everything', async () => {
    // Control. A denylist that hid real breaches would be far worse than the blank amber row.
    respond([row(1, 'sla_message_breach'), row(2, 'sla_ticket_first_response')]);
    const { result } = renderHook(() => useSLANotifications());
    await waitFor(() => expect(result.current.notifications).toHaveLength(2));
  });

  it('subtracts the filtered rows from the bell total', async () => {
    // Otherwise the bell counts things it refuses to show, and the number never reconciles
    // with the list under it.
    respond([row(1, 'sla_message_breach'), row(2, 'one_sided_outbound')]);
    const { result } = renderHook(() => useSLANotifications());
    await waitFor(() => expect(result.current.notifications).toHaveLength(1));

    expect(result.current.total).toBe(1);
  });
});
