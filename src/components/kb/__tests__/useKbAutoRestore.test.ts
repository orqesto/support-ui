import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const restore = vi.hoisted(() => vi.fn());
vi.mock('@/services/kbAutoActions.service', () => ({ kbAutoActionsService: { restore } }));
vi.mock('@/lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { useKbAutoRestore } from '../useKbAutoRestore';

const applied = { requested: 'auto_removed' as const, applied: true };

describe('useKbAutoRestore', () => {
  it('sends one restore per row while a call is in flight, and allows it again after', async () => {
    let finish: () => void = () => {};
    restore.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    const reread = vi.fn();
    const { result } = renderHook(() => useKbAutoRestore(true, 'auto_removed', applied, reread));
    act(() => {
      result.current?.restore(5);
      result.current?.restore(5);
    });
    expect(restore).toHaveBeenCalledTimes(1);
    expect(result.current?.pending.has(5)).toBe(true);
    await act(async () => {
      finish();
      await Promise.resolve();
    });
    expect(result.current?.pending.has(5)).toBe(false);
    expect(reread).toHaveBeenCalledTimes(1);
    act(() => result.current?.restore(5));
    expect(restore).toHaveBeenCalledTimes(2);
  });

  it('is off unless the server applied the status to the rows on screen', () => {
    const off = (...args: Parameters<typeof useKbAutoRestore>) =>
      renderHook(() => useKbAutoRestore(...args)).result.current;
    expect(
      off(true, 'auto_removed', { requested: 'auto_removed', applied: false }, vi.fn())
    ).toBeUndefined();
    expect(off(true, 'auto_removed', null, vi.fn())).toBeUndefined();
    expect(off(true, 'rejected', applied, vi.fn())).toBeUndefined();
    expect(off(false, 'auto_removed', applied, vi.fn())).toBeUndefined();
  });
});

describe('Send back to Not live yet wording', () => {
  it('says it goes back to Not live yet, not that it is rejected', async () => {
    const { AUTO_UNDO_TITLE } = await import('../useKbAutoRestore');
    expect(AUTO_UNDO_TITLE.unapprove_mined).toBe(
      'Send back to Not live yet — a person decides on it'
    );
  });
});
