import { useEffect, useRef } from 'react';
import { SELECT_ID_ATTRIBUTE } from './selectMode';

/**
 * Inbox select-mode keys (owner, 2026-09-28): `x` toggles the row that holds keyboard focus,
 * `Esc` clears the selection.
 *
 * The decision is a PURE function so each guard can be tested on its own — the same shape as
 * `detailShortcuts.ts`, whose guards these mirror:
 *  - never while typing: a single-letter key that fires while an agent types "fix" into the
 *    search box is worse than no shortcut;
 *  - never while a dialog, menu or popover is open: it owns Esc (the bulk confirm dialog, the
 *    assignee picker), and closing it must not ALSO throw away the selection it is about;
 *  - never a key another handler already claimed (`defaultPrevented`).
 *
 * The listener is on `window`, which the event reaches AFTER every `document` listener — so the
 * detail rail's Esc (`detailShortcuts`), which calls `preventDefault`, is seen as claimed here.
 */
export type SelectionShortcut = { kind: 'toggle'; conversationId: number } | { kind: 'clear' };

export type SelectionShortcutContext = {
  /** Esc has something to clear. */
  hasSelection: boolean;
  /**
   * The list / board is what the agent is working in. False while the detail pane is open:
   * there Esc belongs to the pane (it closes it), and a row keeps keyboard focus BEHIND the
   * pane after the click that opened it — `x` would tick a row the agent cannot see.
   */
  listActive: boolean;
};

type KeyLike = Pick<
  KeyboardEvent,
  | 'key'
  | 'ctrlKey'
  | 'metaKey'
  | 'altKey'
  | 'isComposing'
  | 'defaultPrevented'
  | 'target'
  | 'repeat'
>;

/** A tick box is not somewhere one types: `x` on a focused row box still toggles that row. */
const NOT_TYPED_INTO = new Set(['checkbox', 'radio', 'button', 'submit', 'reset']);

export const isTypingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLInputElement) return !NOT_TYPED_INTO.has(target.type);
  if (target.closest('textarea, select')) return true;
  // Rich-text editors (the composer is TipTap) are contenteditable, not <textarea>.
  return target.closest('[contenteditable]:not([contenteditable="false"])') !== null;
};

const overlayIsOpen = (): boolean =>
  typeof document !== 'undefined' &&
  document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], dialog[open]') !==
    null;

const focusedRowId = (target: EventTarget | null): number | null => {
  if (!(target instanceof Element)) return null;
  const row = target.closest(`[${SELECT_ID_ATTRIBUTE}]`);
  const raw = row?.getAttribute(SELECT_ID_ATTRIBUTE);
  const conversationId = raw ? Number(raw) : Number.NaN;
  return Number.isInteger(conversationId) && conversationId > 0 ? conversationId : null;
};

export const selectionShortcutFor = (
  event: KeyLike,
  context: SelectionShortcutContext
): SelectionShortcut | null => {
  if (event.defaultPrevented || event.isComposing) return null;
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (isTypingTarget(event.target)) return null;
  if (overlayIsOpen()) return null;
  if (!context.listActive) return null;

  if (event.key === 'x' || event.key === 'X') {
    // Held down, the key would flicker the row on and off at the repeat rate.
    if (event.repeat) return null;
    const conversationId = focusedRowId(event.target);
    return conversationId === null ? null : { kind: 'toggle', conversationId };
  }
  if (event.key === 'Escape') {
    return context.hasSelection ? { kind: 'clear' } : null;
  }
  return null;
};

export const useSelectionShortcuts = (
  context: SelectionShortcutContext,
  handlers: { toggle: (conversationId: number) => void; clear: () => void }
) => {
  const latest = useRef({ context, handlers });
  latest.current = { context, handlers };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const action = selectionShortcutFor(event, latest.current.context);
      if (!action) return;
      event.preventDefault();
      if (action.kind === 'toggle') latest.current.handlers.toggle(action.conversationId);
      else latest.current.handlers.clear();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
};
