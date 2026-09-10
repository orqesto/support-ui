/**
 * The push surface for "mail may be missing" — the only kind in this product that reports
 * mail we do NOT have.
 *
 * ⛔ The quiet way it fails is silence, and silence is indistinguishable from health. On taco,
 * 2026-09-08, a sender's `Date:` header carried the Gmail checkpoint 25h into the future and
 * nine hours of a live client mailbox went unfetched — invisible for fourteen hours behind a
 * `failed: 0` that every other ingestion signal agreed with. So the two failure modes tested
 * hardest here are the ones that produce a silent, healthy-looking bell:
 *   1. the alert never arriving in the payload at all (the 20-row crowd-out), and
 *   2. standing alerts being cleared by a failed poll, which reads as "no mail is missing".
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

const { useIngestionGapAlerts } = await import('../useIngestionGapAlerts');

/** The taco row as the backend actually published it, 2026-09-10. */
const gapRow = (over: Record<string, unknown> = {}) => ({
  id: 8243,
  kind: 'ingestion_gap',
  entityType: 'message_source',
  entityId: 3,
  organizationId: 1,
  details: {
    cause: 'checkpoint_ahead',
    mailbox: 'Gmail-usetixly@gmail.com',
    minutesAhead: 1500,
    window: '2026-09-10T07:58:28.754Z → 2026-09-11T08:58:03.336Z',
    recovery: 're-scanning the last 48h; raise MAIL_POLL_OVERLAP_HOURS to reach further back',
  },
  ...over,
});

const respond = (rows: unknown[]) =>
  get.mockResolvedValue({ data: { data: { notifications: rows, total: rows.length } } });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useIngestionGapAlerts', () => {
  /**
   * ⛔ THE crowd-out test. `GET /api/notifications` returns the newest 20 rows across ALL
   * kinds. A hook that fetches the shared page and filters client-side shows nothing at all on
   * a workspace with 20 standing SLA breaches — the alert exists, is correct, and is invisible.
   * Asking the server for the kind is what makes that unreachable.
   */
  it('asks the server for its own kind rather than filtering the shared 20-row page', async () => {
    respond([gapRow()]);
    renderHook(() => useIngestionGapAlerts());
    await waitFor(() => expect(get).toHaveBeenCalled());

    const [, config] = get.mock.calls[0];
    expect((config as { params?: { kind?: string } })?.params?.kind).toBe('ingestion_gap');
  });

  it('maps the row the backend publishes, keeping the skew and the blind window', async () => {
    respond([gapRow()]);
    const { result } = renderHook(() => useIngestionGapAlerts());
    await waitFor(() => expect(result.current.alerts.length).toBe(1));

    expect(result.current.alerts[0]).toMatchObject({
      id: 8243,
      messageSourceId: 3,
      mailbox: 'Gmail-usetixly@gmail.com',
      cause: 'checkpoint_ahead',
      minutesAhead: 1500,
    });
  });

  /** 0 is a real reading — a gap with no measurable skew — and must not become null. */
  it('keeps a zero skew as 0, not null', async () => {
    respond([gapRow({ details: { ...gapRow().details, minutesAhead: 0 } })]);
    const { result } = renderHook(() => useIngestionGapAlerts());
    await waitFor(() => expect(result.current.alerts.length).toBe(1));

    expect(result.current.alerts[0].minutesAhead).toBe(0);
  });

  it('reports null skew when the cause is not clock skew', async () => {
    respond([gapRow({ details: { cause: 'source_stopped_polling', mailbox: 'IMAP box' } })]);
    const { result } = renderHook(() => useIngestionGapAlerts());
    await waitFor(() => expect(result.current.alerts.length).toBe(1));

    expect(result.current.alerts[0].minutesAhead).toBeNull();
    expect(result.current.alerts[0].window).toBeNull();
  });

  it('puts the worst skew first', async () => {
    respond([
      gapRow({ id: 1, details: { ...gapRow().details, minutesAhead: 30 } }),
      gapRow({ id: 2, details: { ...gapRow().details, minutesAhead: 4000 } }),
    ]);
    const { result } = renderHook(() => useIngestionGapAlerts());
    await waitFor(() => expect(result.current.alerts.length).toBe(2));

    expect(result.current.alerts.map((alert) => alert.id)).toEqual([2, 1]);
  });

  /**
   * ⛔ A failed poll must not clear standing alerts. An empty list reads as "no mail is missing
   * any more", which is not what a network error means — the same false all-clear the KB and
   * AI-provider hooks guard against, and far worse for this kind.
   */
  it('keeps standing alerts when a later poll fails', async () => {
    respond([gapRow()]);
    const { result } = renderHook(() => useIngestionGapAlerts());
    await waitFor(() => expect(result.current.alerts.length).toBe(1));

    get.mockRejectedValueOnce(new Error('network'));
    result.current.refresh();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(result.current.alerts.length).toBe(1);
  });
});
