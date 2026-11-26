/**
 * runRowWrite: a write of one rule from outside the editor (the list's on/off switch) waits its
 * turn. While another write of that rule is in flight it is not sent — enforced in the hook, not
 * only by the disabled switch — and a write of a different rule goes at once. Invented data.
 */
import { describe, it, expect, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('@/hooks/useDepartmentContextKey', () => ({ useDepartmentContextKey: () => 'all' }));
vi.mock('@/lib/toast', () => ({ toast: { error: () => undefined } }));

import { useRuleManagement } from '../useRuleManagement';

type Rule = { id: number; value: string; enabled: boolean };
type Form = { value: string; enabled: boolean };

const rows: Rule[] = [
  { id: 1, value: 'invoice', enabled: true },
  { id: 2, value: 'refund', enabled: true },
];

const setup = () =>
  renderHook(() =>
    useRuleManagement<Rule, Form>({
      fetchRules: () => Promise.resolve(rows.map((row) => ({ ...row }))),
      createRule: () => Promise.reject(new Error('unused')),
      updateRule: () => Promise.reject(new Error('unused')),
      deleteRule: () => Promise.resolve(),
      getInitialFormData: () => ({ value: '', enabled: true }),
      getFormDataFromRule: (rule) => ({ value: rule.value, enabled: rule.enabled }),
    })
  );

describe('useRuleManagement › runRowWrite', () => {
  it('a second write of the same rule while one is in flight is not sent', async () => {
    const hook = setup();
    await waitFor(() => expect(hook.result.current.rules).toHaveLength(2));
    let release: () => void = () => undefined;
    const first = vi.fn(
      () =>
        new Promise<Rule>((resolve) => {
          release = () => resolve({ id: 1, value: 'invoice', enabled: false });
        })
    );
    const second = vi.fn(() => Promise.resolve({ id: 1, value: 'invoice', enabled: true }));
    let firstDone: Promise<boolean> = Promise.resolve(false);
    act(() => {
      firstDone = hook.result.current.runRowWrite(1, first);
    });
    await waitFor(() => expect(hook.result.current.busyRowIds.has(1)).toBe(true));
    let secondSent: boolean | undefined;
    await act(async () => {
      secondSent = await hook.result.current.runRowWrite(1, second);
    });
    expect(secondSent).toBe(false);
    expect(second).not.toHaveBeenCalled();
    await act(async () => {
      release();
      await firstDone;
    });
    expect(hook.result.current.busyRowIds.has(1)).toBe(false);
  });

  it('a write of ANOTHER rule goes at once', async () => {
    const hook = setup();
    await waitFor(() => expect(hook.result.current.rules).toHaveLength(2));
    let release: () => void = () => undefined;
    const first = () =>
      new Promise<Rule>((resolve) => {
        release = () => resolve({ id: 1, value: 'invoice', enabled: false });
      });
    let firstDone: Promise<boolean> = Promise.resolve(false);
    act(() => {
      firstDone = hook.result.current.runRowWrite(1, first);
    });
    const other = vi.fn(() => Promise.resolve({ id: 2, value: 'refund', enabled: false }));
    let otherSent: boolean | undefined;
    await act(async () => {
      otherSent = await hook.result.current.runRowWrite(2, other);
    });
    expect(otherSent).toBe(true);
    expect(other).toHaveBeenCalledTimes(1);
    await act(async () => {
      release();
      await firstDone;
    });
  });
});
