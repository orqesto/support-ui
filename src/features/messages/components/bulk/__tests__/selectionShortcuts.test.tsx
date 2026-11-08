/**
 * `x` toggles the focused row, `Esc` clears the selection (owner, 2026-09-28) — and neither
 * fires while the agent is typing, while a dialog owns the keyboard, or when another handler
 * already claimed the key.
 */
import { cleanup, fireEvent, render, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { selectionShortcutFor, useSelectionShortcuts } from '../selectionShortcuts';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

const ON = { hasSelection: true, listActive: true };

const keyOn = (target: EventTarget | null, key: string, extra: Record<string, unknown> = {}) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  isComposing: false,
  defaultPrevented: false,
  repeat: false,
  target,
  ...extra,
});

/** A selectable row as the list draws it: the id on the root, a box and a button inside. */
const mountRow = (conversationId = 42) => {
  const row = document.createElement('div');
  row.setAttribute('data-select-id', String(conversationId));
  row.tabIndex = 0;
  const box = document.createElement('input');
  box.type = 'checkbox';
  row.appendChild(box);
  document.body.appendChild(row);
  return { row, box };
};

describe('selectionShortcutFor', () => {
  it('x on a focused row toggles THAT row', () => {
    const { row } = mountRow(42);
    expect(selectionShortcutFor(keyOn(row, 'x'), ON)).toEqual({
      kind: 'toggle',
      conversationId: 42,
    });
  });

  it('x on the row’s own checkbox still toggles the row (a tick box is not a text field)', () => {
    const { box } = mountRow(42);
    expect(selectionShortcutFor(keyOn(box, 'x'), ON)).toEqual({
      kind: 'toggle',
      conversationId: 42,
    });
  });

  it('x with focus outside any selectable row does nothing', () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    expect(selectionShortcutFor(keyOn(outside, 'x'), ON)).toBeNull();
    expect(selectionShortcutFor(keyOn(document.body, 'x'), ON)).toBeNull();
  });

  it.each([
    ['a text input', () => document.createElement('input')],
    ['a textarea', () => document.createElement('textarea')],
    ['a select', () => document.createElement('select')],
    [
      'a contenteditable (the TipTap composer)',
      () => {
        const editor = document.createElement('div');
        editor.setAttribute('contenteditable', 'true');
        return editor;
      },
    ],
  ])('neither key fires while typing in %s — even inside a row', (_label, make) => {
    const { row } = mountRow(42);
    const field = make();
    row.appendChild(field);
    expect(selectionShortcutFor(keyOn(field, 'x'), ON)).toBeNull();
    expect(selectionShortcutFor(keyOn(field, 'Escape'), ON)).toBeNull();
  });

  it('neither key fires while a dialog is open', () => {
    const { row } = mountRow(42);
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.appendChild(dialog);
    expect(selectionShortcutFor(keyOn(row, 'x'), ON)).toBeNull();
    expect(selectionShortcutFor(keyOn(row, 'Escape'), ON)).toBeNull();
  });

  it('a key another handler already claimed is left alone', () => {
    const { row } = mountRow(42);
    expect(selectionShortcutFor(keyOn(row, 'Escape', { defaultPrevented: true }), ON)).toBeNull();
    expect(selectionShortcutFor(keyOn(row, 'x', { defaultPrevented: true }), ON)).toBeNull();
  });

  it('modifier chords and key repeat do nothing (Cmd+X is cut, a held x would flicker)', () => {
    const { row } = mountRow(42);
    expect(selectionShortcutFor(keyOn(row, 'x', { metaKey: true }), ON)).toBeNull();
    expect(selectionShortcutFor(keyOn(row, 'x', { ctrlKey: true }), ON)).toBeNull();
    expect(selectionShortcutFor(keyOn(row, 'x', { repeat: true }), ON)).toBeNull();
  });

  it('Esc clears only when there is a selection', () => {
    expect(selectionShortcutFor(keyOn(document.body, 'Escape'), ON)).toEqual({ kind: 'clear' });
    expect(
      selectionShortcutFor(keyOn(document.body, 'Escape'), { ...ON, hasSelection: false })
    ).toBeNull();
  });

  it('neither key acts while the detail pane is open (a row can hold focus behind it)', () => {
    const { row } = mountRow(42);
    const paneOpen = { ...ON, listActive: false };
    expect(selectionShortcutFor(keyOn(row, 'x'), paneOpen)).toBeNull();
    expect(selectionShortcutFor(keyOn(document.body, 'Escape'), paneOpen)).toBeNull();
  });
});

describe('useSelectionShortcuts (bound to window)', () => {
  it('x on a focused row calls toggle(id); Esc calls clear', () => {
    const toggle = vi.fn();
    const clear = vi.fn();
    renderHook(() => useSelectionShortcuts(ON, { toggle, clear }));
    const { row } = mountRow(7);

    fireEvent.keyDown(row, { key: 'x' });
    expect(toggle).toHaveBeenCalledWith(7);

    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('an Esc a document listener claimed first (the detail rail) does not clear', () => {
    const clear = vi.fn();
    const claim = (event: KeyboardEvent) => event.preventDefault();
    // Order as on the page: the page (and this hook) mounts FIRST, the detail pane's listener
    // later. Only a listener that runs after every document listener sees the claim.
    renderHook(() => useSelectionShortcuts(ON, { toggle: vi.fn(), clear }));
    document.addEventListener('keydown', claim);
    try {
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(clear).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('keydown', claim);
    }
  });

  it('Esc that CLOSES a real Dialog (the bulk confirm) does not also clear the selection', () => {
    // The Dialog's own Esc listener sets state; the dialog is still in the DOM when this
    // window listener runs, because React has not re-rendered mid-dispatch. Asserted with the
    // real component rather than reasoned about.
    const clear = vi.fn();
    const Harness = () => {
      const [open, setOpen] = useState(true);
      useSelectionShortcuts(ON, { toggle: vi.fn(), clear });
      return (
        <Dialog open={open} onOpenChange={setOpen}>
          <p>Resolve 3 conversations?</p>
        </Dialog>
      );
    };
    render(<Harness />);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();

    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(clear).not.toHaveBeenCalled();

    // Dialog gone: the NEXT Esc is the selection's.
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('x typed into a field inside a row does not toggle the row', () => {
    const toggle = vi.fn();
    renderHook(() => useSelectionShortcuts(ON, { toggle, clear: vi.fn() }));
    const { container } = render(
      <div data-select-id="9">
        <textarea aria-label="note" />
      </div>
    );
    fireEvent.keyDown(container.querySelector('textarea')!, { key: 'x' });
    expect(toggle).not.toHaveBeenCalled();
  });
});
