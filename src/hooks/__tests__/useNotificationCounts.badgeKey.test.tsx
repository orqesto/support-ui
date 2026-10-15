/**
 * The Needs Routing badge (sidebar + bell) reads `useNotificationCounts`. Actions that empty the
 * queue (Route, spam, delete…) refresh it by invalidating NOTIFICATION_COUNTS_KEY. They used to
 * invalidate ['needs-routing-count'], a key no query reads since the badge moved to these counts,
 * so the badge kept its old number until the 60 s poll (seen on the local demo 2026-10-15).
 */
import type { ReactNode } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const server = vi.hoisted(() => ({ needsRouting: 3 }));
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: () => Promise.resolve({ data: { data: { needs_routing: server.needsRouting } } }),
  },
}));
vi.mock('@/lib/socketManager', () => ({
  getSocket: () => undefined,
  subscribeToEvent: () => undefined,
  unsubscribeFromEvent: () => undefined,
  releaseSocket: () => undefined,
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (s: unknown) => unknown) =>
    select({ user: { organizationId: 1 }, selectedOrganizationId: 1 }),
}));
vi.mock('@/hooks/useDepartmentContextKey', () => ({ useDepartmentContextKey: () => 'all' }));

const { useNotificationCounts, NOTIFICATION_COUNTS_KEY } = await import('../useNotificationCounts');

const setup = () => {
  server.needsRouting = 3;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useNotificationCounts(), { wrapper });
  return { client, hook };
};

describe('the Needs Routing badge refresh key', () => {
  it('invalidating NOTIFICATION_COUNTS_KEY refetches the badge count at once', async () => {
    // Literal on purpose: an undefined key would invalidate every query and pass vacuously.
    expect(NOTIFICATION_COUNTS_KEY).toEqual(['notification-counts']);
    const { client, hook } = setup();
    await waitFor(() => expect(hook.result.current.counts.needs_routing).toBe(3));
    server.needsRouting = 0;
    await act(() => client.invalidateQueries({ queryKey: NOTIFICATION_COUNTS_KEY }));
    await waitFor(() => expect(hook.result.current.counts.needs_routing).toBe(0));
  });

  it('control: the old key reaches no query, so the badge keeps its old number', async () => {
    const { client, hook } = setup();
    await waitFor(() => expect(hook.result.current.counts.needs_routing).toBe(3));
    server.needsRouting = 0;
    await act(() => client.invalidateQueries({ queryKey: ['needs-routing-count'] }));
    expect(hook.result.current.counts.needs_routing).toBe(3);
  });
});
