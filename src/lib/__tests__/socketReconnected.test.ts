/**
 * The socket's "connected AGAIN" signal (SOCKET_RECONNECTED_EVENT), driven through the REAL
 * `connect` handler: the views that follow server events re-read once when the socket comes back
 * — never on its first connect, which every page load already pays for with its own reads.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as SocketManagerModule from '@/lib/socketManager';
import { SOCKET_RECONNECTED_EVENT } from '@/lib/socketEvents';

type Handler = (arg?: unknown) => void;
const created: { fire: (event: string) => void }[] = [];

vi.mock('socket.io-client', () => ({
  io: () => {
    const handlers = new Map<string, Handler[]>();
    const socket = {
      connected: false,
      connect: vi.fn(),
      disconnect: vi.fn(),
      on: (event: string, handler: Handler) =>
        handlers.set(event, [...(handlers.get(event) ?? []), handler]),
      off: () => undefined,
      emit: () => undefined,
      fire: (event: string) => handlers.get(event)?.forEach((handler) => handler()),
    };
    created.push(socket);
    return socket;
  },
}));
vi.mock('@/lib/api-client', () => ({
  ensureFreshSession: () => Promise.resolve(),
  isRateLimited: () => false,
  refreshRetryInMs: () => 0,
}));

let manager: typeof SocketManagerModule;
beforeEach(async () => {
  created.length = 0;
  vi.resetModules();
  manager = await import('@/lib/socketManager');
});
afterEach(() => manager.forceDisconnect());

describe('the socket coming back after a drop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.6);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  // 0.6 × the 5 s jitter.
  const JITTER = 3_000;

  it('is announced after a reconnect — not on the first connect — after a random 0–5 s wait', () => {
    const resync = vi.fn();
    manager.getSocket();
    manager.subscribeToEvent(SOCKET_RECONNECTED_EVENT, resync);
    const [socket] = created;

    socket.fire('connect');
    vi.advanceTimersByTime(10_000);
    expect(resync).not.toHaveBeenCalled();
    socket.fire('disconnect');
    socket.fire('connect');
    vi.advanceTimersByTime(JITTER - 1);
    expect(resync).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(resync).toHaveBeenCalledTimes(1);
  });

  it('a flapping link re-reads at most once per 30 s', () => {
    const resync = vi.fn();
    manager.getSocket();
    manager.subscribeToEvent(SOCKET_RECONNECTED_EVENT, resync);
    const [socket] = created;
    socket.fire('connect');
    for (let flap = 0; flap < 10; flap += 1) {
      socket.fire('connect');
      vi.advanceTimersByTime(1_000);
    }
    vi.advanceTimersByTime(JITTER);
    expect(resync).toHaveBeenCalledTimes(1);
    // CONTROL: past the interval, a reconnect re-reads again.
    vi.advanceTimersByTime(manager.RECONNECT_RESYNC_MIN_INTERVAL_MS);
    socket.fire('connect');
    vi.advanceTimersByTime(JITTER);
    expect(resync).toHaveBeenCalledTimes(2);
  });

  it("a NEW socket (after a sign-out or a workspace switch) starts over: its first connect isn't one", () => {
    const resync = vi.fn();
    manager.getSocket();
    created[0].fire('connect');
    manager.forceDisconnect();
    manager.getSocket();
    manager.subscribeToEvent(SOCKET_RECONNECTED_EVENT, resync);
    created[1].fire('connect');
    vi.advanceTimersByTime(10_000);
    expect(resync).not.toHaveBeenCalled();
  });
});
