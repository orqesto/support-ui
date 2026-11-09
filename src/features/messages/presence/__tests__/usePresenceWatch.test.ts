import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@/types';
import type { PresenceSettings, PresenceViewer } from '../presence.types';

type Handler = (data: unknown) => void;
const fake = vi.hoisted(() => ({
  handlers: new Map<string, Set<(data: unknown) => void>>(),
  /** What each `presence:watch` answers; default: every id watchable, nobody there. */
  answerWatch: null as null | ((ids: number[]) => unknown),
  emitWithAck: null as unknown as Mock,
  emit: null as unknown as Mock,
  /** When each presence:state left (fake clock). */
  stateTimes: [] as number[],
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
const { resetPresenceClientForTests, STATE_SEND_GAP_MS } = await import('../presenceClient');
const { SOCKET_RECONNECTED_EVENT } = await import('@/lib/socketEvents');

const SETTINGS: PresenceSettings = {
  enabled: true,
  heartbeatMs: 15_000,
  expiryMs: 45_000,
  writingIdleMs: 120_000,
  awayAfterMs: 300_000,
  listFlushMs: 2_000,
  ticketWatchCap: 50,
};
const ME = 1;
const viewer = (userId: number, state: PresenceViewer['state'], since: string): PresenceViewer => ({
  userId,
  state,
  since,
});

const okAck = (ids: number[], viewers: Record<number, PresenceViewer[]> = {}, mapped = {}) => ({
  ok: true,
  viewers,
  settings: SETTINGS,
  mapped: { ...Object.fromEntries(ids.map((id) => [id, id])), ...mapped },
});

const fire = (event: string, data?: unknown) =>
  fake.handlers.get(event)?.forEach((handler) => handler(data));
const watchCalls = () =>
  fake.emitWithAck.mock.calls
    .filter(([event]) => event === 'presence:watch')
    .map(([, payload]) => (payload as { conversationIds: number[] }).conversationIds);
const emitted = (event: string): unknown[] =>
  (fake.emit.mock.calls as unknown[][])
    .filter(([name]) => name === event)
    .map(([, payload]) => payload);
/**
 * Lets the acks resolve, then moves the clock. The ack's renders (settings → the reporter's first
 * state → its send) finish when act flushes, so the clock moves in a second act after that.
 */
const settle = async (ms = 0) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  fake.handlers.clear();
  fake.answerWatch = null;
  fake.stateTimes = [];
  fake.emit = vi.fn((event: string) => {
    if (event === 'presence:state') fake.stateTimes.push(Date.now());
  });
  fake.emitWithAck = vi.fn((event: string, payload?: { conversationIds: number[] }) => {
    if (event !== 'presence:watch') return Promise.resolve({ ok: true });
    const ids = payload?.conversationIds ?? [];
    return Promise.resolve(fake.answerWatch ? fake.answerWatch(ids) : okAck(ids));
  });
  resetPresenceClientForTests();
  useAuthStore.setState({ user: { id: ME, role: 'user' } as User });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('usePresenceWatch — who else is on these threads', () => {
  it('unavailable (and no viewers) until the watch is acknowledged', async () => {
    let release: (value: unknown) => void = () => {};
    fake.emitWithAck.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
    const { result } = renderHook(() => usePresenceWatch([10]));
    expect(result.current.available).toBe(false);
    expect(result.current.viewers).toEqual([]);
    release(okAck([10]));
    await settle();
    expect(result.current.available).toBe(true);
    expect(result.current.settings).toEqual(SETTINGS);
  });

  it('lists the other agents from the ack, never me', async () => {
    fake.answerWatch = (ids) =>
      okAck(ids, {
        10: [
          viewer(ME, 'viewing', '2026-11-09T10:00:00Z'),
          viewer(2, 'viewing', '2026-11-09T10:01:00Z'),
        ],
      });
    const { result } = renderHook(() => usePresenceWatch([10]));
    await settle();
    expect(result.current.viewers).toEqual([viewer(2, 'viewing', '2026-11-09T10:01:00Z')]);
  });

  it('one agent on several threads is one entry: strongest state, earliest since', async () => {
    fake.answerWatch = (ids) =>
      okAck(ids, {
        10: [viewer(2, 'viewing', '2026-11-09T10:00:00Z')],
        11: [
          viewer(2, 'writing_reply', '2026-11-09T10:05:00Z'),
          viewer(3, 'away', '2026-11-09T09:00:00Z'),
        ],
        12: [viewer(3, 'writing_note', '2026-11-09T10:09:00Z')],
      });
    const { result } = renderHook(() => usePresenceWatch([10, 11, 12]));
    await settle();
    expect(result.current.viewers).toEqual([
      viewer(3, 'writing_note', '2026-11-09T09:00:00Z'),
      viewer(2, 'writing_reply', '2026-11-09T10:00:00Z'),
    ]);
  });

  it('watches in batches of 20, each its own emit', async () => {
    const ids = Array.from({ length: 45 }, (_, index) => index + 1);
    renderHook(() => usePresenceWatch(ids));
    await settle();
    expect(watchCalls().map((batch) => batch.length)).toEqual([20, 20, 5]);
  });

  it('a presence:thread event replaces that thread’s viewers', async () => {
    const { result } = renderHook(() => usePresenceWatch([10]));
    await settle();
    act(() =>
      fire('presence:thread', {
        conversationId: 10,
        viewers: [
          viewer(ME, 'viewing', '2026-11-09T10:00:00Z'),
          viewer(4, 'writing_reply', '2026-11-09T10:02:00Z'),
        ],
      })
    );
    expect(result.current.viewers).toEqual([viewer(4, 'writing_reply', '2026-11-09T10:02:00Z')]);
  });

  it('CONTROL: a presence:thread event for a thread not watched changes nothing', async () => {
    const { result } = renderHook(() => usePresenceWatch([10]));
    await settle();
    act(() =>
      fire('presence:thread', {
        conversationId: 77,
        viewers: [viewer(4, 'viewing', '2026-11-09T10:02:00Z')],
      })
    );
    expect(result.current.viewers).toEqual([]);
  });

  it('follows the server’s mapping: events for the survivor of a merged id count', async () => {
    fake.answerWatch = (ids) => okAck(ids, { 99: [] }, { 10: 99 });
    const { result } = renderHook(() => usePresenceWatch([10]));
    await settle();
    act(() =>
      fire('presence:thread', {
        conversationId: 99,
        viewers: [viewer(5, 'viewing', '2026-11-09T10:02:00Z')],
      })
    );
    expect(result.current.viewers).toEqual([viewer(5, 'viewing', '2026-11-09T10:02:00Z')]);
  });

  it('an ack timeout ⇒ unavailable', async () => {
    fake.emitWithAck.mockRejectedValue(new Error('operation has timed out'));
    const { result } = renderHook(() => usePresenceWatch([10]));
    await settle();
    expect(result.current.available).toBe(false);
  });

  it('an {ok:false} ack ⇒ unavailable; a retry that succeeds makes it available', async () => {
    fake.answerWatch = () => ({ ok: false });
    const { result } = renderHook(() => usePresenceWatch([10]));
    await settle();
    expect(result.current.available).toBe(false);
    fake.answerWatch = null;
    await settle(10_000);
    expect(result.current.available).toBe(true);
  });

  it('a later {ok:false} ack (the re-watch after a merge) drops it back to unavailable', async () => {
    const { result } = renderHook(() => usePresenceWatch([10]));
    await settle();
    expect(result.current.available).toBe(true);
    fake.answerWatch = () => ({ ok: false });
    act(() =>
      fire('conversation:updated', {
        action: 'merge',
        conversationId: 10,
        conversationIds: [10, 12],
      })
    );
    await settle();
    expect(result.current.available).toBe(false);
    expect(result.current.viewers).toEqual([]);
  });

  it('a disconnect ⇒ unavailable; the reconnect re-watches and it comes back', async () => {
    const { result } = renderHook(() => usePresenceWatch([10]));
    await settle();
    expect(result.current.available).toBe(true);
    act(() => fire('disconnect', 'transport close'));
    expect(result.current.available).toBe(false);
    expect(watchCalls()).toHaveLength(1);
    act(() => fire(SOCKET_RECONNECTED_EVENT));
    await settle();
    expect(watchCalls()).toEqual([[10], [10]]);
    expect(result.current.available).toBe(true);
  });

  it('a merge naming a watched thread re-watches', async () => {
    renderHook(() => usePresenceWatch([10]));
    await settle();
    act(() =>
      fire('conversation:updated', {
        action: 'merge',
        conversationId: 50,
        conversationIds: [50, 10],
      })
    );
    await settle();
    expect(watchCalls()).toEqual([[10], [10]]);
  });

  it('CONTROL: a merge of other threads, or another action on ours, does not', async () => {
    renderHook(() => usePresenceWatch([10]));
    await settle();
    act(() =>
      fire('conversation:updated', {
        action: 'merge',
        conversationId: 50,
        conversationIds: [50, 51],
      })
    );
    act(() =>
      fire('conversation:updated', { action: 'close', conversationId: 10, conversationIds: [10] })
    );
    await settle();
    expect(watchCalls()).toEqual([[10]]);
  });

  it('changed ids: unwatches only the dropped ones, watches only the new ones', async () => {
    const { rerender } = renderHook((ids: number[]) => usePresenceWatch(ids), {
      initialProps: [10, 11],
    });
    await settle();
    rerender([11, 12]);
    await settle();
    expect(watchCalls()).toEqual([[10, 11], [12]]);
    expect(emitted('presence:unwatch')).toEqual([{ conversationIds: [10] }]);
  });

  it('unwatches every survivor on unmount', async () => {
    fake.answerWatch = (ids) => okAck(ids, {}, { 10: 99 });
    const { unmount } = renderHook(() => usePresenceWatch([10, 11]));
    await settle();
    unmount();
    expect(emitted('presence:unwatch')).toEqual([{ conversationIds: [99, 11] }]);
  });
});

describe('usePresenceWatch — reporting this tab’s state', () => {
  const reporter = (
    over: Partial<{ composerText: string; composerMode: 'reply' | 'note' }> = {}
  ) => ({
    composerText: '',
    composerMode: 'reply' as const,
    lastAgentEditAt: { current: null as number | null },
    ...over,
  });

  it('after the ack, sends presence:state for every watched id (watch stores nothing)', async () => {
    fake.answerWatch = (ids) => okAck(ids, {}, { 10: 99 });
    renderHook(() => usePresenceWatch([10, 11], reporter()));
    await settle(STATE_SEND_GAP_MS * 4);
    expect(emitted('presence:state')).toEqual([
      { conversationId: 99, state: 'viewing' },
      { conversationId: 11, state: 'viewing' },
    ]);
  });

  it('a state change is sent at once; a heartbeat re-sends every heartbeatMs', async () => {
    const edit = { current: null as number | null };
    const { rerender } = renderHook(
      (input: ReturnType<typeof reporter>) => usePresenceWatch([10], input),
      { initialProps: { ...reporter(), lastAgentEditAt: edit } }
    );
    await settle(2_000);
    edit.current = Date.now();
    rerender({ ...reporter({ composerText: '<p>Hi</p>' }), lastAgentEditAt: edit });
    await settle(STATE_SEND_GAP_MS);
    expect(emitted('presence:state')).toEqual([
      { conversationId: 10, state: 'viewing' },
      { conversationId: 10, state: 'writing_reply' },
    ]);
    await settle(SETTINGS.heartbeatMs);
    expect(emitted('presence:state')).toHaveLength(3);
    await settle(SETTINGS.heartbeatMs);
    expect(emitted('presence:state')).toHaveLength(4);
  });

  it('at most one send per second per thread: a quick change goes out after the second', async () => {
    const edit = { current: null as number | null };
    const { rerender } = renderHook(
      (input: ReturnType<typeof reporter>) => usePresenceWatch([10], input),
      { initialProps: { ...reporter(), lastAgentEditAt: edit } }
    );
    await settle(STATE_SEND_GAP_MS);
    edit.current = Date.now();
    rerender({ ...reporter({ composerText: '<p>Hi</p>' }), lastAgentEditAt: edit });
    await settle(STATE_SEND_GAP_MS);
    expect(emitted('presence:state')).toHaveLength(1);
    await settle(1_000);
    expect(emitted('presence:state')).toEqual([
      { conversationId: 10, state: 'viewing' },
      { conversationId: 10, state: 'writing_reply' },
    ]);
  });

  it('without reporter input (a list view) it watches but never reports', async () => {
    renderHook(() => usePresenceWatch([10]));
    await settle(SETTINGS.heartbeatMs * 2);
    expect(watchCalls()).toEqual([[10]]);
    expect(emitted('presence:state')).toEqual([]);
  });

  it('a global admin watches but never reports', async () => {
    useAuthStore.setState({ user: { id: ME, role: 'admin' } as User });
    const { result } = renderHook(() => usePresenceWatch([10], reporter()));
    await settle(SETTINGS.heartbeatMs * 2);
    expect(result.current.available).toBe(true);
    expect(emitted('presence:state')).toEqual([]);
  });

  it('sends no more than 4 states in any second on one socket (the server drops > 5/s)', async () => {
    const ids = Array.from({ length: 20 }, (_, index) => index + 1);
    renderHook(() => usePresenceWatch(ids, reporter()));
    await settle(10_000);
    expect(fake.stateTimes).toHaveLength(20);
    for (const start of fake.stateTimes) {
      const inWindow = fake.stateTimes.filter((at) => at >= start && at < start + 1_000);
      expect(inWindow.length).toBeLessThanOrEqual(4);
    }
  });
});
