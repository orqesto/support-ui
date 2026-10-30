/**
 * The notification counts are shown by four components at once (layout, bell, threads page,
 * board). They share one query, but each mount registered its own socket handlers, so one ping
 * invalidated the query four times — and invalidateQueries cancels the refetch in flight and starts
 * another — up to four GETs per event. One ping must cost ONE request.
 *
 * Over the REAL api-client; only the wire and the socket are fake. The fake socket broadcasts to
 * every subscriber, as socketManager does.
 */
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/authStore';
import { installTransport, ok } from '@/test/apiTransport';

const socket = vi.hoisted(() => ({
  listeners: new Map<string, Set<(data?: unknown) => void>>(),
  emit(event: string, data?: unknown) {
    for (const listener of this.listeners.get(event) ?? []) listener(data);
  },
}));
vi.mock('@/lib/socketManager', () => ({
  getSocket: () => undefined,
  releaseSocket: () => undefined,
  subscribeToEvent: (event: string, listener: (data?: unknown) => void) => {
    const set = socket.listeners.get(event) ?? new Set();
    set.add(listener);
    socket.listeners.set(event, set);
  },
  unsubscribeFromEvent: (event: string, listener: (data?: unknown) => void) => {
    socket.listeners.get(event)?.delete(listener);
  },
}));
vi.mock('@/hooks/useDepartmentContextKey', () => ({ useDepartmentContextKey: () => 'all' }));

const { useNotificationCounts } = await import('../useNotificationCounts');

let wire: ReturnType<typeof installTransport>;
beforeEach(() => {
  useAuthStore.setState({ selectedOrganizationId: 1 });
  wire = installTransport(apiClient, () => ok({ spam_arrival: 2 }));
});
afterEach(() => wire.restore());

const countGets = () => wire.calls('GET', '/api/notifications/counts').length;

const mountConsumers = (howMany: number) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return Array.from({ length: howMany }, () =>
    renderHook(() => useNotificationCounts(), { wrapper })
  );
};

describe('notification counts: one socket subscription', () => {
  it('four mounted consumers + one ping → exactly one GET', async () => {
    const hooks = mountConsumers(4);
    await waitFor(() => expect(hooks[3]?.result.current.counts.spam_arrival).toBe(2));
    const before = countGets();

    act(() => socket.emit('notification:new', { kind: 'spam_arrival' }));
    await waitFor(() => expect(countGets()).toBeGreaterThan(before));
    // Settle: nothing else follows.
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(countGets() - before).toBe(1);
    expect(socket.listeners.get('notification:new')?.size).toBe(1);
    hooks.forEach((hook) => hook.unmount());
  });

  it('the subscription outlives any one consumer and goes with the last', async () => {
    const hooks = mountConsumers(2);
    await waitFor(() => expect(hooks[1]?.result.current.counts.spam_arrival).toBe(2));
    hooks[0]?.unmount();
    expect(socket.listeners.get('conversation:routed')?.size).toBe(1);
    const before = countGets();
    act(() => socket.emit('conversation:routed', {}));
    await waitFor(() => expect(countGets()).toBe(before + 1));
    hooks[1]?.unmount();
    expect(socket.listeners.get('conversation:routed')?.size ?? 0).toBe(0);
  });

  it('control: a ping that does not move the counts asks for nothing', async () => {
    const hooks = mountConsumers(4);
    await waitFor(() => expect(hooks[0]?.result.current.counts.spam_arrival).toBe(2));
    const before = countGets();
    act(() => socket.emit('notification:new', { kind: 'sla_breach' }));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(countGets()).toBe(before);
    hooks.forEach((hook) => hook.unmount());
  });
});
