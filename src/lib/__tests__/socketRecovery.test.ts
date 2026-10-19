/**
 * The WebSocket's own recovery, driven through the REAL `connect_error` handler. The decision
 * (`afterRefusedRenewal`) is tested in sessionRefresh.test.ts; this file pins that the handler
 * actually uses it — reverting the handler to "any refused renewal signs out" must go red here —
 * and that a pending reconnect dies with the socket it was for.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type * as SocketManagerModule from '@/lib/socketManager';

type Handler = (arg?: unknown) => void;

interface FakeSocket {
  handlers: Map<string, Handler[]>;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  on: (event: string, handler: Handler) => void;
  off: () => void;
  emit: () => void;
  fire: (event: string, arg?: unknown) => void;
}

const created: FakeSocket[] = [];

const fakeSocket = (): FakeSocket => {
  const handlers = new Map<string, Handler[]>();
  return {
    handlers,
    connect: vi.fn(),
    disconnect: vi.fn(),
    on: (event, handler) => handlers.set(event, [...(handlers.get(event) ?? []), handler]),
    off: () => undefined,
    emit: () => undefined,
    fire: (event, arg) => handlers.get(event)?.forEach((handler) => handler(arg)),
  };
};

vi.mock('socket.io-client', () => ({
  io: () => {
    const socket = fakeSocket();
    created.push(socket);
    return socket;
  },
}));

// Per-test behaviour of the renewal, set before each case. A plain function, not a module-level
// vi.fn, so a rejection is only ever created inside the test that awaits it.
let renewal: () => Promise<void> = () => Promise.resolve();
vi.mock('@/lib/api-client', () => ({
  ensureFreshSession: () => renewal(),
  isRateLimited: (err: unknown) =>
    (err as { response?: { status?: number } } | undefined)?.response?.status === 429,
  refreshRetryInMs: () => 30_000,
}));

const rateLimited = () =>
  Object.assign(new Error('Request failed with status code 429'), { response: { status: 429 } });
const sessionOver = () =>
  Object.assign(new Error('Request failed with status code 401'), { response: { status: 401 } });

let assignedHref: string | null = null;
let manager: typeof SocketManagerModule;
const realLocation = Object.getOwnPropertyDescriptor(window, 'location');

beforeEach(async () => {
  vi.useFakeTimers();
  created.length = 0;
  assignedHref = null;
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      pathname: '/threads',
      set href(value: string) {
        assignedHref = value;
      },
      get href() {
        return assignedHref ?? '';
      },
    },
  });
  vi.resetModules();
  manager = await import('@/lib/socketManager');
});

afterEach(() => {
  manager.forceDisconnect();
  vi.useRealTimers();
  if (realLocation) Object.defineProperty(window, 'location', realLocation);
});

const expiredHandshake = () => ({ message: 'Invalid or expired token' });

describe('the WebSocket handshake refused for an expired token', () => {
  it('renewal refused for RATE: reconnects after the wait and stays signed in', async () => {
    renewal = () => Promise.reject(rateLimited());
    manager.getSocket();
    const [socket] = created;

    socket.fire('connect_error', expiredHandshake());
    await vi.advanceTimersByTimeAsync(29_999);
    expect(socket.connect).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(socket.connect).toHaveBeenCalledTimes(1);
    expect(assignedHref).toBeNull();
  });

  it('control: renewal refused because the session is over signs out', async () => {
    renewal = () => Promise.reject(sessionOver());
    manager.getSocket();
    const [socket] = created;

    socket.fire('connect_error', expiredHandshake());
    await vi.advanceTimersByTimeAsync(0);

    expect(assignedHref).toBe('/login');
    expect(socket.connect).not.toHaveBeenCalled();
  });

  it('a pending reconnect dies with its socket: no reconnect after a sign-out teardown', async () => {
    renewal = () => Promise.reject(rateLimited());
    manager.getSocket();
    const [first] = created;

    first.fire('connect_error', expiredHandshake());
    await vi.advanceTimersByTimeAsync(0);
    manager.forceDisconnect();
    // The timer itself is gone, not merely harmless when it fires.
    expect(vi.getTimerCount()).toBe(0);
    manager.getSocket();
    const second = created[1];
    await vi.advanceTimersByTimeAsync(60_000);

    expect(first.connect).not.toHaveBeenCalled();
    expect(second.connect).not.toHaveBeenCalled();
    expect(assignedHref).toBeNull();
  });

  it('a socket replaced while its renewal is in flight is not reconnected by it', async () => {
    let settle: () => void = () => undefined;
    renewal = () =>
      new Promise<void>((resolve) => {
        settle = resolve;
      });
    manager.getSocket();
    const [first] = created;

    first.fire('connect_error', expiredHandshake());
    manager.forceDisconnect();
    manager.getSocket();
    const second = created[1];
    settle();
    await vi.advanceTimersByTimeAsync(0);

    expect(first.connect).not.toHaveBeenCalled();
    expect(second.connect).not.toHaveBeenCalled();
  });

  it('after a teardown mid-wait, the next socket still gets its own renewal, not a sign-out', async () => {
    renewal = () => Promise.reject(rateLimited());
    manager.getSocket();
    const [first] = created;
    first.fire('connect_error', expiredHandshake());
    await vi.advanceTimersByTimeAsync(0);

    // The idle release: no subscribers for the debounce window.
    manager.releaseSocket();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(vi.getTimerCount()).toBe(0);

    let renewed = false;
    renewal = () => {
      renewed = true;
      return Promise.resolve();
    };
    manager.getSocket();
    const second = created[1];
    second.fire('connect_error', expiredHandshake());
    await vi.advanceTimersByTimeAsync(0);

    expect(renewed).toBe(true);
    expect(assignedHref).toBeNull();
    expect(second.connect).toHaveBeenCalledTimes(1);
  });
});
