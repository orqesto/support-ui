import type { KeyboardEvent, RefObject } from 'react';

/**
 * Escape closes a row's assignee picker (list row, Kanban card) and puts focus back on the
 * Claim / avatar button that opened it. Until 2026-11-11 only a click outside closed it.
 *
 * Used on the picker (a body-level portal) and on the trigger's wrapper, so Escape works wherever
 * focus is. ⛔ An Escape that something inside already handled — the assignee Select closing its
 * own list marks it `defaultPrevented` — is left alone, and so is one from outside the picker and
 * its trigger: one press closes one layer.
 */
export const closePickerOnEscape =
  (open: boolean, close: () => void, trigger: RefObject<HTMLButtonElement | null>) =>
  (event: KeyboardEvent) => {
    if (!open || event.key !== 'Escape' || event.defaultPrevented) return;
    // Only Escape pressed IN the picker or ON its trigger. The "a colleague is writing — assign
    // anyway?" question renders beside the picker in the same React tree, so its Escape passes
    // through here too and must reach the question's own handler.
    const target = event.target as Element;
    if (target !== trigger.current && !target.closest?.('[data-assignee-picker]')) return;
    event.preventDefault();
    // Not the page's Escape too (it clears the selection / closes the thread).
    event.stopPropagation();
    close();
    trigger.current?.focus();
  };
