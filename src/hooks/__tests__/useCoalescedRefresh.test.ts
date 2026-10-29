import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SERVER_EVENT_REFRESH_MS, useCoalescedRefresh } from '../useCoalescedRefresh';

describe('useCoalescedRefresh', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('runs once per window however many events arrive', () => {
    const refresh = vi.fn();
    const { result } = renderHook(() => useCoalescedRefresh(refresh));
    act(() => {
      for (let idx = 0; idx < 20; idx += 1) result.current();
    });
    expect(refresh).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(SERVER_EVENT_REFRESH_MS);
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('a steady stream still refreshes (coalesced, not debounced)', () => {
    const refresh = vi.fn();
    const { result } = renderHook(() => useCoalescedRefresh(refresh, 1000));
    act(() => {
      for (let tick = 0; tick < 30; tick += 1) {
        result.current();
        vi.advanceTimersByTime(100);
      }
    });
    // 3 s of events every 100 ms → one refresh per elapsed window (1, 2, 3 s), never zero.
    expect(refresh).toHaveBeenCalledTimes(3);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    // The stream stopped, so nothing is pending.
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it('uses the latest callback and never fires after unmount', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender, unmount } = renderHook(({ fn }) => useCoalescedRefresh(fn, 1000), {
      initialProps: { fn: first },
    });
    act(() => result.current());
    rerender({ fn: second });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    act(() => result.current());
    unmount();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe('useCoalescedRefresh — a hidden tab waits', () => {
  const setVisibility = (state: 'visible' | 'hidden') => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
    document.dispatchEvent(new Event('visibilitychange'));
  };
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    setVisibility('visible');
    vi.useRealTimers();
  });

  it('refreshes nothing while hidden, then ONCE when the tab comes back', () => {
    const refresh = vi.fn();
    const { result } = renderHook(() => useCoalescedRefresh(refresh, 1000));
    setVisibility('hidden');
    act(() => {
      for (let window = 0; window < 5; window += 1) {
        result.current();
        vi.advanceTimersByTime(1000);
      }
    });
    expect(refresh).not.toHaveBeenCalled();
    act(() => setVisibility('visible'));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('CONTROL — coming back with nothing missed refreshes nothing', () => {
    const refresh = vi.fn();
    renderHook(() => useCoalescedRefresh(refresh, 1000));
    act(() => setVisibility('hidden'));
    act(() => setVisibility('visible'));
    expect(refresh).not.toHaveBeenCalled();
  });
});
