import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { KBEntry } from '@/services/kb.service';

const calls: string[] = [];
vi.mock('@/services/kb.service', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  kbService: {
    approve: (id: number) => {
      calls.push(`approve:${id}`);
      return id === 3 ? Promise.reject(new Error('gone')) : Promise.resolve({ success: true });
    },
    reject: (id: number) => {
      calls.push(`reject:${id}`);
      return Promise.resolve({ success: true });
    },
  },
}));
vi.mock('@/services/kbQuality.service', () => ({
  kbQualityService: {
    bulkReject: (ids: number[]) => {
      calls.push(`bulk:${ids.join(',')}`);
      return Promise.resolve({ results: [], rejected: 1, expired: 1, failed: 0, forbidden: 0 });
    },
  },
}));
const { useKbBulkDecisions } = await import('../useKbBulkDecisions');

const row = (id: number, kind: string | null, canDecide = true): KBEntry =>
  ({
    id,
    pendingDecision: kind ? { suggestionId: 100 + id, kind, reasons: [], canDecide } : null,
  }) as unknown as KBEntry;

describe('useKbBulkDecisions', () => {
  it('approves only decidable captures; one failure is counted, not fatal', async () => {
    calls.length = 0;
    const onDone = vi.fn();
    const { result } = renderHook(() =>
      useKbBulkDecisions(
        [
          row(1, 'approve_capture'),
          row(2, 'approve_capture', false),
          row(3, 'approve_capture'),
          row(4, 'merge'),
        ],
        onDone
      )
    );
    act(() => {
      for (const id of [1, 2, 3, 4]) result.current.toggle(id, true);
    });
    let outcome;
    await act(async () => {
      outcome = await result.current.approveSelected();
    });
    expect(calls).toEqual(['approve:1', 'approve:3']);
    expect(outcome).toEqual({ done: 1, skipped: 0, failed: 1 });
    expect(onDone).toHaveBeenCalled();
    expect(result.current.selected.size).toBe(0);
  });

  it('remove: decided elsewhere (expired) is reported as skipped', async () => {
    calls.length = 0;
    const { result } = renderHook(() =>
      useKbBulkDecisions([row(5, 'remove'), row(6, 'remove'), row(7, 'rewrite')], () => {})
    );
    act(() => {
      for (const id of [5, 6, 7]) result.current.toggle(id, true);
    });
    let outcome;
    await act(async () => {
      outcome = await result.current.removeSelected();
    });
    expect(calls).toEqual(['bulk:105,106']);
    expect(outcome).toEqual({ done: 1, skipped: 1, failed: 0 });
  });

  it('only rows the person can decide and a bulk action covers are selectable', () => {
    const { result } = renderHook(() =>
      useKbBulkDecisions(
        [
          row(1, 'approve_capture'),
          row(2, 'remove', false),
          row(3, 'merge'),
          row(4, null),
          row(5, 'remove'),
        ],
        () => {}
      )
    );
    expect(result.current.selectableIds).toEqual([1, 5]);
    act(() => result.current.toggle(2, true));
    expect(result.current.selected.has(2)).toBe(false);
  });

  it('rejects only decidable captures', async () => {
    calls.length = 0;
    const { result } = renderHook(() =>
      useKbBulkDecisions(
        [row(1, 'approve_capture'), row(2, 'approve_capture', false), row(3, 'remove')],
        () => {}
      )
    );
    act(() => {
      for (const id of [1, 2, 3]) result.current.toggle(id, true);
    });
    let outcome;
    await act(async () => {
      outcome = await result.current.rejectSelected();
    });
    expect(calls).toEqual(['reject:1']);
    expect(outcome).toEqual({ done: 1, skipped: 0, failed: 0 });
  });

  it('selectable set follows the action kind the bar offers', () => {
    const entries = [row(1, 'approve_capture'), row(5, 'remove')];
    const capture = renderHook(() => useKbBulkDecisions(entries, () => {}, 'needs_decision'));
    expect(capture.result.current.selectableIds).toEqual([1]);
    const removal = renderHook(() => useKbBulkDecisions(entries, () => {}, 'suggested_change'));
    expect(removal.result.current.selectableIds).toEqual([5]);
    act(() => removal.result.current.toggle(1, true));
    expect(removal.result.current.selected.size).toBe(0);
  });

  it('clears the selection when the rows shown change (filter or page)', () => {
    const { result, rerender } = renderHook(
      ({ rows }) => useKbBulkDecisions(rows, () => {}, 'needs_decision'),
      { initialProps: { rows: [row(1, 'approve_capture')] } }
    );
    act(() => result.current.toggle(1, true));
    expect(result.current.selected.size).toBe(1);
    rerender({ rows: [row(1, 'approve_capture')] });
    expect(result.current.selected.size).toBe(1);
    rerender({ rows: [row(9, 'approve_capture')] });
    expect(result.current.selected.size).toBe(0);
  });
});
