/**
 * Review of #999 (H2): the backend announces a reply before the channel answers and says nothing on
 * success, so a reply shown as "Sending…" is re-read on a bounded schedule until it has its state.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { MessageEvent } from '@/types';
import { RECHECK_FOR_MS, useSendingRecheck } from '../useSendingRecheck';

const ev = (metadata: Record<string, unknown> | null): MessageEvent =>
  ({ id: 7, type: 'agent_reply', content: 'x', metadata }) as unknown as MessageEvent;
const setHidden = (hidden: boolean) =>
  Object.defineProperty(document, 'visibilityState', {
    value: hidden ? 'hidden' : 'visible',
    configurable: true,
  });

beforeEach(() => {
  vi.useFakeTimers();
  setHidden(false);
});
afterEach(() => {
  vi.useRealTimers();
  setHidden(false);
});

describe('useSendingRecheck', () => {
  it('re-reads while a reply is "Sending…", backing off, and stops once it has its state', () => {
    const recheck = vi.fn();
    const view = renderHook(({ events }) => useSendingRecheck(events, recheck), {
      initialProps: { events: [ev({ sendState: 'sending' })] },
    });
    vi.advanceTimersByTime(2_999);
    expect(recheck).toHaveBeenCalledTimes(0);
    vi.advanceTimersByTime(1);
    expect(recheck).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(6_000);
    expect(recheck).toHaveBeenCalledTimes(2);
    // The read turned it "✓ Sent": no more reads.
    view.rerender({ events: [ev(null)] });
    vi.advanceTimersByTime(120_000);
    expect(recheck).toHaveBeenCalledTimes(2);
  });

  it('CONTROL: nothing sending → no timer at all', () => {
    const recheck = vi.fn();
    renderHook(() => useSendingRecheck([ev(null), ev({ delivered: false })], recheck));
    vi.advanceTimersByTime(120_000);
    expect(recheck).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops after the bound (the backend gives a send up at 4 minutes)', () => {
    const recheck = vi.fn();
    renderHook(() => useSendingRecheck([ev({ sendState: 'sending' })], recheck));
    vi.advanceTimersByTime(RECHECK_FOR_MS + 60_000);
    const calls = recheck.mock.calls.length;
    vi.advanceTimersByTime(10 * 60_000);
    expect(recheck.mock.calls.length).toBe(calls);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reads nothing while the tab is hidden', () => {
    const recheck = vi.fn();
    setHidden(true);
    renderHook(() => useSendingRecheck([ev({ sendState: 'sending' })], recheck));
    vi.advanceTimersByTime(60_000);
    expect(recheck).not.toHaveBeenCalled();
    setHidden(false);
    vi.advanceTimersByTime(30_000);
    expect(recheck).toHaveBeenCalled();
  });

  it('leaves no timer behind on unmount (a thread switch remounts)', () => {
    const recheck = vi.fn();
    const view = renderHook(() => useSendingRecheck([ev({ sendState: 'sending' })], recheck));
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(recheck).not.toHaveBeenCalled();
  });
});
