import { useEffect, useRef } from 'react';

/**
 * Single-key shortcuts for message detail (v3): R reply · N note · E resolve · J/K next/prev ·
 * Esc close.
 *
 * The decision is a PURE function so every guard is testable on its own. The guards are the
 * whole point: a single-letter shortcut that fires while someone is typing "Regards" into the
 * composer is worse than no shortcut at all.
 */
export type DetailShortcut = 'reply' | 'note' | 'resolve' | 'next' | 'prev' | 'close';

export type ShortcutContext = {
  /** False when there is no resolve decision to make (resolveMode === null). */
  canResolve: boolean;
  /** J/K act only where a list exists to move through. */
  canNavigate: boolean;
  /** Esc closes only a surface that can close (the slide-over, not the full page). */
  canClose: boolean;
};

type KeyLike = Pick<
  KeyboardEvent,
  'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'isComposing' | 'defaultPrevented' | 'target'
>;

const isTypingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) return false;
  if (target.closest('input, textarea, select')) return true;
  // Rich-text editors (the composer is TipTap) are contenteditable, not <textarea>.
  return target.closest('[contenteditable]:not([contenteditable="false"])') !== null;
};

/** A modal owns the keyboard while it is open — its own Esc must not also close the rail. */
const dialogIsOpen = (): boolean =>
  typeof document !== 'undefined' &&
  document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]') !== null;

export const shortcutFor = (event: KeyLike, context: ShortcutContext): DetailShortcut | null => {
  if (event.defaultPrevented || event.isComposing) return null;
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (isTypingTarget(event.target)) return null;
  if (dialogIsOpen()) return null;

  switch (event.key) {
    case 'r':
    case 'R':
      return 'reply';
    case 'n':
    case 'N':
      return 'note';
    case 'e':
    case 'E':
      return context.canResolve ? 'resolve' : null;
    case 'j':
    case 'J':
      return context.canNavigate ? 'next' : null;
    case 'k':
    case 'K':
      return context.canNavigate ? 'prev' : null;
    case 'Escape':
      return context.canClose ? 'close' : null;
    default:
      return null;
  }
};

/**
 * Binds `shortcutFor` to the document. Handlers are read through a ref, so the listener is
 * attached once and never re-subscribes on render.
 */
export const useDetailShortcuts = (
  context: ShortcutContext,
  handlers: Partial<Record<DetailShortcut, () => void>>
) => {
  const latest = useRef({ context, handlers });
  latest.current = { context, handlers };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const action = shortcutFor(event, latest.current.context);
      if (!action) return;
      const handler = latest.current.handlers[action];
      if (!handler) return;
      event.preventDefault();
      handler();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
};

/**
 * J/K target: the next / previous row of the list the user is looking at. Spam-log rows are
 * skipped — they open a read-only preview, not the detail. At either end, or when the open
 * conversation is not in the list, there is no target: nothing happens rather than wrapping.
 */
export const neighbourThread = <T extends { threadId: string }>(
  threads: readonly T[],
  currentThreadId: string | null,
  direction: 'next' | 'prev'
): T | null => {
  const order = threads.filter((thread) => !thread.threadId.startsWith('spamlog_'));
  const index = order.findIndex((thread) => thread.threadId === currentThreadId);
  if (index === -1) return null;
  return order[direction === 'next' ? index + 1 : index - 1] ?? null;
};

/**
 * The hint line: ONLY keys that act in this view, built from the same context the shortcuts
 * read — so the hint can never promise J/K on the full page, or E on a resolved thread.
 * Esc is left out: closing is already on screen as the X.
 */
export const shortcutHint = (context: ShortcutContext): string =>
  [
    'R reply',
    'N note',
    context.canResolve ? 'E resolve' : null,
    context.canNavigate ? 'J/K next' : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');
