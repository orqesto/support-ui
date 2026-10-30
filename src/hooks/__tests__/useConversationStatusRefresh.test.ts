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

const { useConversationStatusRefresh, CONV_STATUS_REFRESH_MS } = await import(
  '../useConversationStatusRefresh'
);
const fire = (conversationId: number) =>
  handlers.get('conv:status_changed')?.({
    organizationId: 7,
    conversationId,
    status: 'client_replied',
    previousStatus: 'closed',
    reason: 'resurface',
  });

beforeEach(() => {
  vi.useFakeTimers();
  handlers.clear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useConversationStatusRefresh — the open thread header follows a reopen without a reload', () => {
  it('a status change on THIS thread re-reads it', () => {
    const refresh = vi.fn();
    renderHook(() => useConversationStatusRefresh(41, refresh));
    fire(41);
    vi.advanceTimersByTime(CONV_STATUS_REFRESH_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('CONTROL: a status change on another thread does nothing', () => {
    const refresh = vi.fn();
    renderHook(() => useConversationStatusRefresh(41, refresh));
    fire(42);
    vi.advanceTimersByTime(CONV_STATUS_REFRESH_MS * 4);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('two changes from one save ⇒ one re-read', () => {
    const refresh = vi.fn();
    renderHook(() => useConversationStatusRefresh(41, refresh));
    fire(41);
    vi.advanceTimersByTime(200);
    fire(41);
    vi.advanceTimersByTime(CONV_STATUS_REFRESH_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('a parent that passes no refresh is fine (nothing to call)', () => {
    renderHook(() => useConversationStatusRefresh(41, undefined));
    fire(41);
    expect(() => vi.advanceTimersByTime(CONV_STATUS_REFRESH_MS)).not.toThrow();
  });
});
