import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useResultFor } from '../useResultFor';

describe('useResultFor', () => {
  it('shows a result only while the input it was produced for is current', () => {
    const { result, rerender } = renderHook(({ key }) => useResultFor<string>(key), {
      initialProps: { key: 'a' },
    });
    act(() => result.current.keep('ok for a', 'a'));
    expect(result.current.result).toBe('ok for a');

    rerender({ key: 'b' });
    expect(result.current.result).toBeNull();
    expect(result.current.isCurrent('a')).toBe(false);
    expect(result.current.isCurrent('b')).toBe(true);
  });

  it('⛔ a result kept for an older input never shows', () => {
    const { result } = renderHook(() => useResultFor<string>('b'));
    act(() => result.current.keep('ok for a', 'a'));
    expect(result.current.result).toBeNull();
  });

  it('clear drops it', () => {
    const { result } = renderHook(() => useResultFor<string>('a'));
    act(() => result.current.keep('ok', 'a'));
    act(() => result.current.clear());
    expect(result.current.result).toBeNull();
  });
});
