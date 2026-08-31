import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

/**
 * The notification that says the AI stopped answering has to actually reach a person.
 *
 * Prod, 2026-08-30: OpenAI returned `429 no credits remaining` for twenty hours while
 * every health surface reported green. Analysis did not stop — it fell back to local
 * embedding analysis — so mail kept being classified on a weaker signal and the only
 * symptom was answers quietly getting worse.
 *
 * ⚠️ The reason this hook exists rather than reusing the SLA bell: that bell is
 * fail-open by design (an unknown kind still renders, so a real breach can never be
 * hidden), which means an `ai_provider_down` row would have rendered there as an amber
 * "breach" with no breach fields — the exact mis-render its own guard was written to
 * prevent. `NON_SLA_BELL_KINDS` now excludes it, and this hook owns it instead.
 *
 * 🪤 A sibling kind, `mailbox_address_undeclared`, is published by the backend and is
 * referenced NOWHERE in this app — it renders in no surface at all. That is the failure
 * this test exists to stop repeating.
 */

const get = vi.fn();
const patch = vi.fn(() => Promise.resolve({ data: {} }));
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => get(...args) as unknown,
    patch: (...args: unknown[]) => patch(...args) as unknown,
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

const { useAiProviderAlerts } = await import('../useAiProviderAlerts');

const row = (over: Record<string, unknown> = {}) => ({
  id: 1,
  kind: 'ai_provider_down',
  entityType: 'ai_provider',
  entityId: 5,
  organizationId: 21,
  severity: 'critical',
  createdAt: '2026-08-30T12:58:00.000Z',
  details: {
    provider: 'openai',
    reason: '429 You have no credits remaining.',
    since: '2026-08-30T12:58:00.000Z',
    message: 'Live calls are failing',
    degradedTo: 'local_embeddings',
  },
  ...over,
});

const respond = (notifications: unknown[]) =>
  get.mockResolvedValue({ data: { data: { notifications, total: notifications.length } } });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useAiProviderAlerts', () => {
  it('surfaces an ai_provider_down notification with its reason', async () => {
    respond([row()]);
    const { result } = renderHook(() => useAiProviderAlerts());

    await waitFor(() => expect(result.current.alerts).toHaveLength(1));
    expect(result.current.alerts[0].provider).toBe('openai');
    expect(result.current.alerts[0].reason).toContain('no credits remaining');
    // The degrade is the part nothing else says out loud.
    expect(result.current.alerts[0].degradedTo).toBe('local_embeddings');
  });

  it('ignores every other kind sharing the same endpoint', async () => {
    respond([
      row({ id: 2, kind: 'sla_message_breach' }),
      row({ id: 3, kind: 'spam_arrival' }),
      row({ id: 4, kind: 'mailbox_address_undeclared' }),
    ]);
    const { result } = renderHook(() => useAiProviderAlerts());

    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(result.current.alerts).toEqual([]);
  });

  it('does not clear a standing alert when the poll fails', async () => {
    respond([row()]);
    const { result } = renderHook(() => useAiProviderAlerts());
    await waitFor(() => expect(result.current.alerts).toHaveLength(1));

    // An empty list on a network error would read as "the provider recovered" — the
    // opposite of what a failed request means.
    get.mockRejectedValueOnce(new Error('network'));
    await act(() => {
      result.current.refresh();
      return Promise.resolve();
    });
    expect(result.current.alerts).toHaveLength(1);
  });

  it('dismisses optimistically and tells the server', async () => {
    respond([row()]);
    const { result } = renderHook(() => useAiProviderAlerts());
    await waitFor(() => expect(result.current.alerts).toHaveLength(1));

    await act(() => {
      result.current.dismiss(1);
      return Promise.resolve();
    });
    expect(result.current.alerts).toHaveLength(0);
    expect(patch).toHaveBeenCalledWith('/api/notifications/1/dismiss');
  });
});
