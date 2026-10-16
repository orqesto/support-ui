import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

/**
 * #957 final review: the personal kinds (`conversation_assigned`, `new_unassigned_message`) go out as
 * `notification:new {kind}` to every connected tab of the user. Each single-kind alert hook used to
 * refetch on EVERY `new` / `resolved` ping, so a burst of assignments fired N list requests per hook.
 * A ping that names ANOTHER kind is not theirs; a kind-less ping (older backend / other emitters) and
 * their own kind still refetch.
 */
const get = vi.fn<(url: string, config?: unknown) => Promise<unknown>>();
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (url: string, config?: unknown) => get(url, config),
    patch: () => Promise.resolve({ data: {} }),
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

const { useAiProviderAlerts, AI_PROVIDER_DOWN_KIND } = await import('../useAiProviderAlerts');
const { useUnansweredOutboundAlerts, ONE_SIDED_OUTBOUND_KIND, CUSTOMER_REPLY_IN_SPAM_KIND } =
  await import('../useUnansweredOutboundAlerts');
const { useIngestionDarkAlerts, INGESTION_DARK_KIND } = await import('../useIngestionDarkAlerts');
const { useStaleKbAlerts, KB_DOCUMENT_STALE_KIND } = await import('../useStaleKbAlerts');
const { useIngestionGapAlerts, INGESTION_GAP_KIND } = await import('../useIngestionGapAlerts');

const cases = [
  ['useAiProviderAlerts', useAiProviderAlerts, AI_PROVIDER_DOWN_KIND, ['notification:new', 'notification:resolved']],
  ['useUnansweredOutboundAlerts (one-sided)', useUnansweredOutboundAlerts, ONE_SIDED_OUTBOUND_KIND, ['notification:new', 'notification:resolved']],
  ['useUnansweredOutboundAlerts (spam)', useUnansweredOutboundAlerts, CUSTOMER_REPLY_IN_SPAM_KIND, ['notification:new']],
  ['useIngestionDarkAlerts', useIngestionDarkAlerts, INGESTION_DARK_KIND, ['notification:new']],
  ['useStaleKbAlerts', useStaleKbAlerts, KB_DOCUMENT_STALE_KIND, ['notification:new']],
  ['useIngestionGapAlerts', useIngestionGapAlerts, INGESTION_GAP_KIND, ['notification:new']],
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  handlers.clear();
  get.mockResolvedValue({ data: { data: { notifications: [], total: 0, hasMore: false } } });
});

describe.each(cases)('%s', (_name, useHook, ownKind, events) => {
  it.each(events)('%s: another kind does not refetch; kind-less and its own kind do', async (event) => {
    renderHook(() => useHook());
    await waitFor(() => expect(get).toHaveBeenCalled());
    await act(async () => {});
    const baseline = get.mock.calls.length;

    act(() => handlers.get(event)?.({ kind: 'new_unassigned_message', id: 9 }));
    await act(async () => {});
    expect(get).toHaveBeenCalledTimes(baseline);

    act(() => handlers.get(event)?.());
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(baseline));
    const afterKindless = get.mock.calls.length;

    act(() => handlers.get(event)?.({ kind: ownKind, id: 9 }));
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(afterKindless));
  });
});
