/**
 * The bell's "waiting for your review" rows for KB captures.
 *
 * What the hook can get wrong: asking for the wrong kind (the unfiltered list is 20 rows across
 * every kind, so a review would scroll off), acting on the NOTIFICATION id instead of the
 * review's suggestion id, and dropping a row whose decision FAILED — which reads as done.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

type GetConfig = { params?: { kind?: string } };
const get = vi.fn<(url: string, config?: GetConfig) => Promise<unknown>>();
const acceptSuggestion = vi.fn<(id: number) => Promise<void>>();
const declineSuggestion = vi.fn<(id: number) => Promise<void>>();

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: (url: string, config?: GetConfig) => get(url, config) },
}));
vi.mock('@/services/learning.service', () => ({
  learningService: {
    acceptSuggestion: (id: number) => acceptSuggestion(id),
    declineSuggestion: (id: number) => declineSuggestion(id),
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

const { useKbReviewAlerts, KB_REVIEW_KIND } = await import('../useKbReviewAlerts');

const row = (over: Record<string, unknown> = {}) => ({
  id: 5,
  kind: 'kb_review_pending',
  entityType: 'kb_review',
  entityId: 900,
  organizationId: 21,
  severity: null,
  createdAt: '2026-09-19T09:00:00.000Z',
  details: {
    suggestionId: 900,
    conversationId: 102343,
    conversationPublicId: 'SUP-42',
    subject: 'Order question',
    entryCount: 2,
    capturedVia: 'resolve',
  },
  ...over,
});

const respond = (notifications: unknown[]) =>
  get.mockResolvedValue({ data: { data: { notifications, total: notifications.length } } });

beforeEach(() => {
  vi.clearAllMocks();
  acceptSuggestion.mockResolvedValue();
  declineSuggestion.mockResolvedValue();
});

describe('useKbReviewAlerts', () => {
  it('asks for its own kind, and maps the row to the review it names', async () => {
    respond([row()]);
    const { result } = renderHook(() => useKbReviewAlerts());

    await waitFor(() => expect(result.current.alerts).toHaveLength(1));
    expect(get).toHaveBeenCalledWith('/api/notifications', { params: { kind: KB_REVIEW_KIND } });
    expect(result.current.alerts[0]).toMatchObject({
      id: 5,
      suggestionId: 900,
      conversationId: 102343,
      conversationPublicId: 'SUP-42',
      entryCount: 2,
    });
  });

  it('ignores other kinds a backend that dropped ?kind= would send', async () => {
    respond([row(), row({ id: 6, kind: 'kb_document_stale' })]);
    const { result } = renderHook(() => useKbReviewAlerts());
    await waitFor(() => expect(result.current.alerts).toHaveLength(1));
  });

  it('Approve accepts the REVIEW (suggestion id), not the notification, and removes the row', async () => {
    respond([row()]);
    const { result } = renderHook(() => useKbReviewAlerts());
    await waitFor(() => expect(result.current.alerts).toHaveLength(1));

    await act(() => result.current.decide(result.current.alerts[0], 'approve'));

    expect(acceptSuggestion).toHaveBeenCalledWith(900);
    expect(declineSuggestion).not.toHaveBeenCalled();
    expect(result.current.alerts).toHaveLength(0);
  });

  it('Reject declines the review', async () => {
    respond([row()]);
    const { result } = renderHook(() => useKbReviewAlerts());
    await waitFor(() => expect(result.current.alerts).toHaveLength(1));

    await act(() => result.current.decide(result.current.alerts[0], 'reject'));

    expect(declineSuggestion).toHaveBeenCalledWith(900);
    expect(result.current.alerts).toHaveLength(0);
  });

  it('a FAILED decision keeps the row and says why — it must not look done', async () => {
    respond([row()]);
    acceptSuggestion.mockRejectedValue(new Error('Insufficient permissions'));
    const { result } = renderHook(() => useKbReviewAlerts());
    await waitFor(() => expect(result.current.alerts).toHaveLength(1));

    await act(() => result.current.decide(result.current.alerts[0], 'approve'));

    expect(result.current.alerts).toHaveLength(1);
    expect(result.current.error).toBeTruthy();
  });

  it('a failed poll keeps the standing rows', async () => {
    respond([row()]);
    const { result } = renderHook(() => useKbReviewAlerts());
    await waitFor(() => expect(result.current.alerts).toHaveLength(1));

    get.mockRejectedValue(new Error('offline'));
    act(() => result.current.refresh());
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(result.current.alerts).toHaveLength(1);
  });
});
