/**
 * The two rules the board forced on the selection, and the one the action bar forced:
 *  - a selection SURVIVES a board refresh (marking one thread read refreshes the board; the
 *    other fourteen must stay picked),
 *  - it is CLEARED when the scope changes (a filter switch shows different threads), and
 *  - counts from a PREVIOUS selection are never shown beside the current one.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useBulkSelection } from '../useBulkSelection';

const preview = vi.fn<(action: string, ids: number[]) => Promise<unknown>>();
vi.mock('@/services/bulk.service', () => ({
  bulkService: {
    preview: (action: string, ids: number[]) => preview(action, ids),
    run: vi.fn(),
  },
}));

beforeEach(() => {
  preview.mockReset();
  preview.mockImplementation((action: string, ids: number[]) =>
    Promise.resolve({ success: true, data: { action, eligible: ids, refused: [] } })
  );
});

describe('useBulkSelection', () => {
  it('keeps the selection when the board refreshes (same scope)', () => {
    const { result, rerender } = renderHook(({ scope }) => useBulkSelection(scope), {
      initialProps: { scope: 'filters-a' },
    });

    act(() => result.current.selectMany([1, 2, 3]));
    expect(result.current.selectedIds).toEqual([1, 2, 3]);

    // A refresh re-renders with the SAME scope key — the ids still name rows on screen.
    rerender({ scope: 'filters-a' });
    expect(result.current.selectedIds).toEqual([1, 2, 3]);
  });

  it('clears the selection when the filters change', () => {
    const { result, rerender } = renderHook(({ scope }) => useBulkSelection(scope), {
      initialProps: { scope: 'filters-a' },
    });

    act(() => result.current.selectMany([1, 2, 3]));
    rerender({ scope: 'filters-b' });

    // Those ids name rows the agent can no longer see.
    expect(result.current.selectedIds).toEqual([]);
  });

  it('withholds the previous selection’s counts until the new ones arrive', async () => {
    const { result } = renderHook(() => useBulkSelection('scope'));

    act(() => result.current.selectMany([1, 2]));
    await waitFor(() => expect(result.current.previews.resolve?.eligible).toEqual([1, 2]));

    // Selection grows; the old counts describe a selection that no longer exists.
    act(() => result.current.toggle(3));
    expect(result.current.previews.resolve).toBeUndefined();
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.previews.resolve?.eligible).toEqual([1, 2, 3]));
    expect(result.current.loading).toBe(false);
  });

  it('offers nothing for an action the server refuses to describe', async () => {
    // A 403 — a permission this agent does not hold. The bar must not offer it.
    preview.mockImplementation((action: string, ids: number[]) =>
      action === 'assign'
        ? Promise.reject(new Error('403'))
        : Promise.resolve({ success: true, data: { action, eligible: ids, refused: [] } })
    );

    const { result } = renderHook(() => useBulkSelection('scope'));
    act(() => result.current.selectMany([1]));

    await waitFor(() => expect(result.current.previews.resolve).toBeDefined());
    expect(result.current.previews.assign).toBeUndefined();
  });

  it('deselectMany removes only what it names', () => {
    const { result } = renderHook(() => useBulkSelection('scope'));

    act(() => result.current.selectMany([1, 2, 3, 4]));
    act(() => result.current.deselectMany([2, 4]));

    expect(result.current.selectedIds).toEqual([1, 3]);
  });
});

/**
 * Shift-click ranges (owner, 2026-09-28). The anchor is the last row toggled; the order is the
 * order the rows are DRAWN in, which the caller passes — the hook never guesses it.
 */
describe('useBulkSelection — toggleRange', () => {
  const ORDER = [10, 20, 30, 40, 50];

  it('selects A..E in drawn order after clicking A then shift-clicking E', () => {
    const { result } = renderHook(() => useBulkSelection('scope'));
    act(() => result.current.toggle(10));
    act(() => result.current.toggleRange(50, ORDER));
    expect([...result.current.selectedIds].sort((left, right) => left - right)).toEqual(ORDER);
  });

  it('ranges backwards too (anchor below the shift-clicked row)', () => {
    const { result } = renderHook(() => useBulkSelection('scope'));
    act(() => result.current.toggle(40));
    act(() => result.current.toggleRange(20, ORDER));
    expect([...result.current.selectedIds].sort((left, right) => left - right)).toEqual([
      20, 30, 40,
    ]);
  });

  it('with no anchor a shift-click selects ONE row', () => {
    const { result } = renderHook(() => useBulkSelection('scope'));
    act(() => result.current.toggleRange(30, ORDER));
    expect(result.current.selectedIds).toEqual([30]);
  });

  it('an anchor that is not in this order (another column, a row gone) is no anchor', () => {
    const { result } = renderHook(() => useBulkSelection('scope'));
    act(() => result.current.toggle(999));
    act(() => result.current.toggleRange(30, ORDER));
    expect(result.current.selectedIds).toEqual([999, 30]);
  });

  it('shift-clicking a SELECTED row unticks the range, and leaves rows outside it alone', () => {
    const { result } = renderHook(() => useBulkSelection('scope'));
    act(() => result.current.selectMany([...ORDER, 77]));
    act(() => result.current.toggle(20)); // untick 20; anchor = 20
    act(() => result.current.toggle(20)); // tick it again; anchor still 20
    act(() => result.current.toggleRange(40, ORDER)); // 40 is selected ⇒ untick 20..40
    expect([...result.current.selectedIds].sort((left, right) => left - right)).toEqual([
      10, 50, 77,
    ]);
  });

  it('the shift-clicked row becomes the next anchor', () => {
    const { result } = renderHook(() => useBulkSelection('scope'));
    act(() => result.current.toggle(10));
    act(() => result.current.toggleRange(20, ORDER));
    act(() => result.current.toggleRange(40, ORDER));
    expect([...result.current.selectedIds].sort((left, right) => left - right)).toEqual([
      10, 20, 30, 40,
    ]);
  });

  it('clearing forgets the anchor: the next shift-click is a single toggle', () => {
    const { result } = renderHook(() => useBulkSelection('scope'));
    act(() => result.current.toggle(10));
    act(() => result.current.clear());
    act(() => result.current.toggleRange(40, ORDER));
    expect(result.current.selectedIds).toEqual([40]);
  });

  it('a scope change forgets the anchor as well', () => {
    const { result, rerender } = renderHook(({ scope }) => useBulkSelection(scope), {
      initialProps: { scope: 'a' },
    });
    act(() => result.current.toggle(10));
    rerender({ scope: 'b' });
    act(() => result.current.toggleRange(40, ORDER));
    expect(result.current.selectedIds).toEqual([40]);
  });
});
