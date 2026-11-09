/**
 * usePresenceReport: the ticket composer reports this tab's state on its ticked threads while the
 * ticket view (usePresenceWatch, no reporter) holds the watch on the same socket.
 */
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@/types';
import type { PresenceSettings } from '../presence.types';

type Handler = (data: unknown) => void;
const fake = vi.hoisted(() => ({
  handlers: new Map<string, Set<(data: unknown) => void>>(),
  emitWithAck: null as unknown as Mock,
  emit: null as unknown as Mock,
}));

vi.mock('@/lib/socketManager', () => ({
  getSocket: () => ({
    timeout: () => ({ emitWithAck: fake.emitWithAck }),
    emit: fake.emit,
  }),
  releaseSocket: () => {},
  subscribeToEvent: (event: string, handler: Handler) => {
    if (!fake.handlers.has(event)) fake.handlers.set(event, new Set());
    fake.handlers.get(event)?.add(handler);
  },
  unsubscribeFromEvent: (event: string, handler: Handler) => {
    fake.handlers.get(event)?.delete(handler);
  },
}));

const { usePresenceWatch } = await import('../usePresenceWatch');
const { usePresenceReport } = await import('../usePresenceReport');
const { resetPresenceClientForTests } = await import('../presenceClient');
const { resetWatchRegistryForTests } = await import('../watchRegistry');

const SETTINGS: PresenceSettings = {
  enabled: true,
  heartbeatMs: 15_000,
  expiryMs: 45_000,
  writingIdleMs: 120_000,
  awayAfterMs: 300_000,
  listFlushMs: 2_000,
  ticketWatchCap: 50,
};
const okAck = (ids: number[]) => ({
  ok: true,
  organizationId: 1,
  viewers: {},
  settings: SETTINGS,
  mapped: Object.fromEntries(ids.map((id) => [id, id])),
});

const states = () =>
  (fake.emit.mock.calls as unknown[][])
    .filter(([name]) => name === 'presence:state')
    .map(([, payload]) => payload as { conversationId: number; state: string });
const watchEvents = () =>
  [...(fake.emitWithAck.mock.calls as unknown[][]), ...(fake.emit.mock.calls as unknown[][])]
    .map(([name]) => name)
    .filter((name) => name === 'presence:watch' || name === 'presence:unwatch');

const settle = async (ms = 0) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

type Props = { watched: number[]; selected: number[]; text: string };
const edit = { current: null as number | null };
const renderPair = (initialProps: Props) =>
  renderHook(
    ({ watched, selected, text }: Props) => {
      usePresenceWatch(watched);
      usePresenceReport(selected, {
        composerText: text,
        composerMode: 'reply',
        lastAgentEditAt: edit,
      });
    },
    { initialProps }
  );

beforeEach(() => {
  vi.useFakeTimers();
  fake.handlers.clear();
  fake.emit = vi.fn();
  fake.emitWithAck = vi.fn((event: string, payload?: { conversationIds: number[] }) =>
    Promise.resolve(
      event === 'presence:watch' ? okAck(payload?.conversationIds ?? []) : { ok: true }
    )
  );
  resetPresenceClientForTests();
  resetWatchRegistryForTests();
  edit.current = null;
  useAuthStore.setState({ user: { id: 1, role: 'user' } as User, selectedOrganizationId: 1 });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('usePresenceReport — state from the ticket composer', () => {
  it('reports on the ticked threads the ticket view watches, and skips one it does not', async () => {
    renderPair({ watched: [10, 11], selected: [10, 11, 99], text: '' });
    await settle(1_000);
    expect(states()).toEqual([
      { conversationId: 10, state: 'viewing' },
      { conversationId: 11, state: 'viewing' },
    ]);
  });

  it('typing a reply turns those threads to writing_reply', async () => {
    const { rerender } = renderPair({ watched: [10, 11], selected: [10], text: '' });
    await settle(1_500);
    edit.current = Date.now();
    rerender({ watched: [10, 11], selected: [10], text: '<p>We are on it</p>' });
    await settle(1_500);
    expect(states().at(-1)).toEqual({ conversationId: 10, state: 'writing_reply' });
    expect(states().some((row) => row.conversationId === 11)).toBe(false);
  });

  it('sends no watch or unwatch of its own (only the ticket view watches)', async () => {
    const { rerender, unmount } = renderPair({ watched: [10], selected: [10], text: '' });
    await settle(1_000);
    expect(watchEvents()).toEqual(['presence:watch']);
    rerender({ watched: [10], selected: [], text: '' });
    await settle(1_000);
    expect(watchEvents()).toEqual(['presence:watch']);
    unmount();
    // The only unwatch is the ticket view's own, on its unmount.
    expect(watchEvents()).toEqual(['presence:watch', 'presence:unwatch']);
  });

  it('a thread unticked while writing goes back to viewing', async () => {
    edit.current = Date.now();
    const { rerender } = renderPair({ watched: [10], selected: [10], text: '<p>Draft</p>' });
    await settle(1_500);
    expect(states().at(-1)).toEqual({ conversationId: 10, state: 'writing_reply' });
    rerender({ watched: [10], selected: [], text: '<p>Draft</p>' });
    await settle(1_500);
    expect(states().at(-1)).toEqual({ conversationId: 10, state: 'viewing' });
  });

  it('a global admin sends nothing', async () => {
    useAuthStore.setState({ user: { id: 1, role: 'admin' } as User });
    edit.current = Date.now();
    renderPair({ watched: [10], selected: [10], text: '<p>Draft</p>' });
    await settle(20_000);
    expect(states()).toEqual([]);
  });

  it('keeps the entry alive with a heartbeat', async () => {
    renderPair({ watched: [10], selected: [10], text: '' });
    await settle(1_000);
    expect(states()).toHaveLength(1);
    await settle(SETTINGS.heartbeatMs);
    expect(states()).toHaveLength(2);
  });
});
