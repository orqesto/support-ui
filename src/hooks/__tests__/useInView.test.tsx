/**
 * useInView: true once the element has come near the viewport, sticky after that; and true from
 * the start where IntersectionObserver does not exist, so a caller never does LESS than before.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRef } from 'react';
import { useInView } from '../useInView';

type Callback = (entries: { isIntersecting: boolean }[]) => void;
const observers: { callback: Callback; options?: IntersectionObserverInit; observed: Element[] }[] =
  [];

class FakeObserver {
  observed: Element[] = [];
  constructor(
    public callback: Callback,
    public options?: IntersectionObserverInit
  ) {
    observers.push({ callback, options, observed: this.observed });
  }
  observe(node: Element) {
    this.observed.push(node);
  }
  disconnect() {}
  unobserve() {}
}

const node = document.createElement('div');
const useHarness = (margin?: string) => {
  const ref = useRef<Element | null>(node);
  return useInView(ref, margin);
};

afterEach(() => {
  observers.length = 0;
  vi.unstubAllGlobals();
});

describe('useInView', () => {
  it('false until the element intersects, then true for good', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const { result } = renderHook(() => useHarness('800px'));
    expect(result.current).toBe(false);
    expect(observers).toHaveLength(1);
    expect(observers[0].observed).toEqual([node]);
    expect(observers[0].options?.rootMargin).toBe('800px');
    act(() => observers[0].callback([{ isIntersecting: false }]));
    expect(result.current).toBe(false);
    act(() => observers[0].callback([{ isIntersecting: true }]));
    expect(result.current).toBe(true);
    // Scrolled away again: still true — what was fetched is kept, and nothing is re-observed.
    act(() => observers[0].callback([{ isIntersecting: false }]));
    expect(result.current).toBe(true);
    expect(observers).toHaveLength(1);
  });

  it('CONTROL: with no IntersectionObserver the answer is true at once', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const { result } = renderHook(() => useHarness());
    expect(result.current).toBe(true);
    expect(observers).toHaveLength(0);
  });
});
