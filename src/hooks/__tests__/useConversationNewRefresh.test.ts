import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const handlers = vi.hoisted(() => new Map<string, () => void>());
vi.mock('@/lib/socketManager', () => ({
  getSocket: () => ({}),
  releaseSocket: () => {},
  subscribeToEvent: (event: string, handler: () => void) => {
    handlers.set(event, handler);
  },
  unsubscribeFromEvent: (event: string) => {
    handlers.delete(event);
  },
}));

const { useConversationNewRefresh, CONVERSATION_NEW_REFRESH_MS } = await import('../useConversationNewRefresh');
const fire = () => handlers.get('conversation:new')?.();

beforeEach(() => {
  vi.useFakeTimers();
  handlers.clear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useConversationNewRefresh (#957 D1)', () => {
  it('one event ⇒ one refresh, one second later', () => {
    const refresh = vi.fn();
    renderHook(() => useConversationNewRefresh(refresh));
    fire();
    vi.advanceTimersByTime(CONVERSATION_NEW_REFRESH_MS - 1);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(CONVERSATION_NEW_REFRESH_MS).toBe(1000);
  });

  it('a burst inside one second ⇒ ONE refresh', () => {
    const refresh = vi.fn();
    renderHook(() => useConversationNewRefresh(refresh));
    fire();
    vi.advanceTimersByTime(300);
    fire();
    vi.advanceTimersByTime(300);
    fire();
    vi.advanceTimersByTime(1000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('Review Focus 1: a stream every 300 ms for 5 s refreshes at least 4 times — never starved', () => {
    const refresh = vi.fn();
    renderHook(() => useConversationNewRefresh(refresh));
    for (let elapsed = 0; elapsed < 5000; elapsed += 300) {
      fire();
      vi.advanceTimersByTime(300);
    }
    expect(refresh.mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it('uses the LATEST refresh callback (page change between event and refetch)', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ cb }) => useConversationNewRefresh(cb), { initialProps: { cb: first } });
    fire();
    rerender({ cb: second });
    vi.advanceTimersByTime(1000);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('unmount ⇒ unsubscribed, and a pending refresh never fires', () => {
    const refresh = vi.fn();
    const { unmount } = renderHook(() => useConversationNewRefresh(refresh));
    fire();
    unmount();
    vi.advanceTimersByTime(2000);
    expect(refresh).not.toHaveBeenCalled();
    expect(handlers.has('conversation:new')).toBe(false);
  });
});
