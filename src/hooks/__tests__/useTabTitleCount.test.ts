import { describe, it, expect, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTabTitleCount } from '../useTabTitleCount';

afterEach(() => {
  document.title = 'Odly';
});

describe('useTabTitleCount', () => {
  it('shows (3) Odly while unread', () => {
    renderHook(() => useTabTitleCount(3));
    expect(document.title).toBe('(3) Odly');
  });

  it('returns to Odly at 0', () => {
    const { rerender } = renderHook(({ n }) => useTabTitleCount(n), { initialProps: { n: 2 } });
    expect(document.title).toBe('(2) Odly');
    rerender({ n: 0 });
    expect(document.title).toBe('Odly');
  });

  it('restores the title on unmount', () => {
    const { unmount } = renderHook(() => useTabTitleCount(4));
    unmount();
    expect(document.title).toBe('Odly');
  });

  it("only replaces the base part of a page's own title", () => {
    document.title = 'Threads - Odly';
    const { rerender } = renderHook(({ n }) => useTabTitleCount(n), { initialProps: { n: 1 } });
    expect(document.title).toBe('(1) Threads - Odly');
    rerender({ n: 5 });
    expect(document.title).toBe('(5) Threads - Odly');
  });
});
