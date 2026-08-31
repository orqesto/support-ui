/**
 * The KB's only push surface.
 *
 * 🪤 The trap this whole feature had to avoid lives in the backend (anchoring staleness on
 * sync time, which keeps advancing on a space nobody maintains). What the HOOK can get
 * wrong is quieter and just as bad: clearing standing alerts on a failed poll, which would
 * read as "everything is fresh again" — the same false all-clear the AI-provider hook guards
 * against, for the same reason.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const get = vi.fn<(url: string) => Promise<unknown>>();
const patch = vi.fn<(url: string) => Promise<unknown>>(() => Promise.resolve({ data: {} }));

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (url: string) => get(url),
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
    selector({ selectedOrganizationId: 21, user: { organizationId: 21 } }),
}));

const { useStaleKbAlerts } = await import('../useStaleKbAlerts');

const row = (over: Record<string, unknown> = {}) => ({
  id: 1,
  kind: 'kb_document_stale',
  entityType: 'documentation',
  entityId: 77,
  organizationId: 21,
  severity: null,
  createdAt: '2026-08-31T09:00:00.000Z',
  details: {
    title: 'Refund policy',
    source: 'confluence',
    staleForDays: 247,
    publicId: 'DOC-3',
  },
  ...over,
});

const respond = (notifications: unknown[]) =>
  get.mockResolvedValue({ data: { data: { notifications, total: notifications.length } } });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useStaleKbAlerts', () => {
  it('surfaces a stale document with what the reader needs to judge it', async () => {
    respond([row()]);

    const { result } = renderHook(() => useStaleKbAlerts());

    await waitFor(() => expect(result.current.alerts).toHaveLength(1));
    expect(result.current.alerts[0]).toMatchObject({
      documentId: 77,
      title: 'Refund policy',
      source: 'confluence',
      staleForDays: 247,
    });
  });

  /** CONTROL: the list carries every kind — picking the wrong ones is the obvious failure. */
  it('CONTROL: ignores notifications of other kinds', async () => {
    respond([
      row({ id: 2, kind: 'sla_message_breach' }),
      row({ id: 3, kind: 'ai_provider_down' }),
      row({ id: 4, kind: 'spam_arrival' }),
    ]);

    const { result } = renderHook(() => useStaleKbAlerts());

    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(result.current.alerts).toHaveLength(0);
  });

  it('puts the stalest document first', async () => {
    respond([
      row({ id: 1, entityId: 10, details: { title: 'Newer', staleForDays: 190 } }),
      row({ id: 2, entityId: 11, details: { title: 'Oldest', staleForDays: 700 } }),
    ]);

    const { result } = renderHook(() => useStaleKbAlerts());

    await waitFor(() => expect(result.current.alerts).toHaveLength(2));
    expect(result.current.alerts[0].title).toBe('Oldest');
  });

  /**
   * THE ONE THAT MATTERS. A fetch error means "we could not ask", not "every document is
   * fresh". Clearing here would show an all-clear the data never supported.
   */
  it('a failed poll does NOT clear standing alerts', async () => {
    respond([row()]);
    const { result, rerender } = renderHook(() => useStaleKbAlerts());
    await waitFor(() => expect(result.current.alerts).toHaveLength(1));

    get.mockRejectedValue(new Error('network'));
    await act(async () => {
      result.current.refresh();
      // Let the rejected fetch settle inside act, so any state update it might make is
      // flushed before the assertion. The point is that it makes none.
      await Promise.resolve();
    });
    rerender();

    expect(result.current.alerts).toHaveLength(1);
  });

  it('dismissing removes the row locally and tells the backend', async () => {
    respond([row({ id: 9 })]);
    const { result } = renderHook(() => useStaleKbAlerts());
    await waitFor(() => expect(result.current.alerts).toHaveLength(1));

    act(() => result.current.dismiss(9));

    expect(result.current.alerts).toHaveLength(0);
    expect(patch).toHaveBeenCalledWith('/api/notifications/9/dismiss');
  });

  it('survives a notification whose details are missing', async () => {
    respond([row({ details: undefined })]);

    const { result } = renderHook(() => useStaleKbAlerts());

    await waitFor(() => expect(result.current.alerts).toHaveLength(1));
    expect(result.current.alerts[0].title).toBe('Untitled document');
  });
});
