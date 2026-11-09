import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { PHONE_QUERY, useIsPhone } from '../useIsPhone';

/**
 * The hook follows the viewport across the 640px line (a rotated phone, a resized window), not
 * just its first reading: the media query's 'change' event flips it.
 */

type Listener = (event: MediaQueryListEvent) => void;

const installMatchMedia = (initial: boolean) => {
  const state = { phone: initial, listeners: new Set<Listener>() };
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      get matches() {
        return state.phone && query === PHONE_QUERY;
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: Listener) => state.listeners.add(listener),
      removeEventListener: (_type: string, listener: Listener) => state.listeners.delete(listener),
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
  /** The viewport crosses 640px: the query now answers `phone`, and says so. */
  const cross = (phone: boolean) => {
    state.phone = phone;
    for (const listener of state.listeners)
      listener({ matches: phone, media: PHONE_QUERY } as MediaQueryListEvent);
  };
  return { state, cross };
};

afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia;
});

describe('useIsPhone', () => {
  it('flips when the viewport crosses 640px, both ways', () => {
    const { cross } = installMatchMedia(false);
    const { result } = renderHook(() => useIsPhone());
    expect(result.current).toBe(false);
    act(() => cross(true));
    expect(result.current).toBe(true);
    act(() => cross(false));
    expect(result.current).toBe(false);
  });

  it('stops listening once unmounted', () => {
    const { state } = installMatchMedia(true);
    const { result, unmount } = renderHook(() => useIsPhone());
    expect(result.current).toBe(true);
    expect(state.listeners.size).toBe(1);
    unmount();
    expect(state.listeners.size).toBe(0);
  });

  it('CONTROL: no matchMedia (jsdom, old embeds) — the desktop answer, no throw', () => {
    delete (window as { matchMedia?: unknown }).matchMedia;
    const { result } = renderHook(() => useIsPhone());
    expect(result.current).toBe(false);
  });
});
