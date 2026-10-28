import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const handlers = vi.hoisted(() => new Map<string, (data: unknown) => void>());
vi.mock('@/lib/socketManager', () => ({
  getSocket: () => ({}),
  releaseSocket: () => {},
  subscribeToEvent: (event: string, handler: (data: unknown) => void) => {
    handlers.set(event, handler);
  },
  unsubscribeFromEvent: (event: string) => {
    handlers.delete(event);
  },
}));

const { useThreadMessageRefresh, THREAD_MESSAGE_REFRESH_MS } = await import('../useThreadMessageRefresh');
const fire = (conversationId: number) => handlers.get('thread:message')?.({ organizationId: 7, conversationId });

beforeEach(() => {
  vi.useFakeTimers();
  handlers.clear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useThreadMessageRefresh — the open thread shows new messages without a reload', () => {
  it('a message on THIS thread refetches it', () => {
    const refresh = vi.fn();
    renderHook(() => useThreadMessageRefresh(41, refresh));
    fire(41);
    vi.advanceTimersByTime(THREAD_MESSAGE_REFRESH_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('CONTROL: a message on another thread does nothing', () => {
    const refresh = vi.fn();
    renderHook(() => useThreadMessageRefresh(41, refresh));
    fire(42);
    vi.advanceTimersByTime(THREAD_MESSAGE_REFRESH_MS * 4);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('the customer message and the bot reply right after it ⇒ one refetch', () => {
    const refresh = vi.fn();
    renderHook(() => useThreadMessageRefresh(41, refresh));
    fire(41);
    vi.advanceTimersByTime(200);
    fire(41);
    vi.advanceTimersByTime(THREAD_MESSAGE_REFRESH_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('switching to another thread listens for that thread', () => {
    const refresh = vi.fn();
    const { rerender } = renderHook(({ id }) => useThreadMessageRefresh(id, refresh), {
      initialProps: { id: 41 },
    });
    rerender({ id: 50 });
    fire(41);
    fire(50);
    vi.advanceTimersByTime(THREAD_MESSAGE_REFRESH_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
