/**
 * reloadAfterOutsideChange: an accepted engine suggestion can rewrite or disable a rule while its
 * editor is open. The editor must close when (and only when) its rule changed on the server —
 * saving the old form would silently undo that change. Invented data.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('../useDepartmentContextKey', () => ({ useDepartmentContextKey: () => 'all' }));

import { useRuleManagement } from '../useRuleManagement';

type Rule = { id: number; value: string; enabled: boolean; hits: number };
type Form = { value: string; enabled: boolean };

const server = { rows: [] as Rule[] };

const setup = () =>
  renderHook(() =>
    useRuleManagement<Rule, Form>({
      fetchRules: () => Promise.resolve(server.rows.map((row) => ({ ...row }))),
      createRule: () => Promise.reject(new Error('unused')),
      updateRule: () => Promise.reject(new Error('unused')),
      deleteRule: () => Promise.resolve(),
      getInitialFormData: () => ({ value: '', enabled: true }),
      // `hits` is NOT form data: a counter moving must not close the editor.
      getFormDataFromRule: (rule) => ({ value: rule.value, enabled: rule.enabled }),
    })
  );

const openEditorOnRule1 = async (hook: ReturnType<typeof setup>) => {
  await waitFor(() => expect(hook.result.current.rules).toHaveLength(1));
  act(() => hook.result.current.handleEdit(hook.result.current.rules[0]));
  act(() => hook.result.current.setFormData({ value: 'typed', enabled: true }));
};

beforeEach(() => {
  server.rows = [{ id: 1, value: 'invoice', enabled: true, hits: 3 }];
});

describe('useRuleManagement › reloadAfterOutsideChange', () => {
  it('rule unchanged on the server (only a counter moved): the editor and the typing stay', async () => {
    const hook = setup();
    await openEditorOnRule1(hook);
    server.rows = [{ id: 1, value: 'invoice', enabled: true, hits: 9 }];
    await act(() => hook.result.current.reloadAfterOutsideChange());
    expect(hook.result.current.editingRule?.id).toBe(1);
    expect(hook.result.current.formData.value).toBe('typed');
    expect(hook.result.current.rules[0].hits).toBe(9);
  });

  it('rule disabled on the server: the editor closes (saving would re-enable it)', async () => {
    const hook = setup();
    await openEditorOnRule1(hook);
    server.rows = [{ id: 1, value: 'invoice', enabled: false, hits: 3 }];
    await act(() => hook.result.current.reloadAfterOutsideChange());
    expect(hook.result.current.editingRule).toBeNull();
  });

  it('rule gone on the server: the editor closes', async () => {
    const hook = setup();
    await openEditorOnRule1(hook);
    server.rows = [];
    await act(() => hook.result.current.reloadAfterOutsideChange());
    expect(hook.result.current.editingRule).toBeNull();
  });

  it('no editor open: just reloads, quietly (no loading flag while the request is open)', async () => {
    let hold: Promise<void> | null = null;
    const hook = renderHook(() =>
      useRuleManagement<Rule, Form>({
        fetchRules: async () => {
          if (hold) await hold;
          return server.rows.map((row) => ({ ...row }));
        },
        createRule: () => Promise.reject(new Error('unused')),
        updateRule: () => Promise.reject(new Error('unused')),
        deleteRule: () => Promise.resolve(),
        getInitialFormData: () => ({ value: '', enabled: true }),
        getFormDataFromRule: (rule) => ({ value: rule.value, enabled: rule.enabled }),
      })
    );
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    let release!: () => void;
    hold = new Promise<void>((resolve) => { release = resolve; });
    server.rows = [{ id: 1, value: 'refund', enabled: true, hits: 3 }];
    let pending!: Promise<void>;
    act(() => {
      pending = hook.result.current.reloadAfterOutsideChange();
    });
    expect(hook.result.current.loading).toBe(false);
    release();
    await act(() => pending);
    expect(hook.result.current.rules[0].value).toBe('refund');
  });

  it('an editor opened while the reload was in flight is still checked (no stale closure)', async () => {
    const hook = setup();
    await waitFor(() => expect(hook.result.current.rules).toHaveLength(1));
    server.rows = [{ id: 1, value: 'invoice', enabled: false, hits: 3 }];
    let pending!: Promise<void>;
    act(() => {
      pending = hook.result.current.reloadAfterOutsideChange();
    });
    act(() => hook.result.current.handleEdit({ id: 1, value: 'invoice', enabled: true, hits: 3 }));
    await act(() => pending);
    expect(hook.result.current.editingRule).toBeNull();
  });
});
