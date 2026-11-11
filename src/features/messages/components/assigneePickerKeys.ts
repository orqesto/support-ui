import type { KeyboardEvent, RefObject } from 'react';

/**
 * Escape closes a row's assignee picker (list row, Kanban card) and puts focus back on the
 * Claim / avatar button that opened it. Until 2026-11-11 only a click outside closed it.
 *
 * Used on the picker (a body-level portal) and on the trigger's wrapper, so Escape works wherever
 * focus is. ⛔ One press closes one layer:
 *  - An Escape that closed the assignee Select's open list is left alone. The Select says so by
 *    stopping the NATIVE event (Select.tsx, the rule its Dialogs rely on). NOT `defaultPrevented`:
 *    react-select prevents default on every Escape, open or not — reading that kept the picker
 *    open for good once focus was in the assignee box (staging, 2026-11-11).
 *  - So is an Escape from outside the picker and its trigger.
 */
export const closePickerOnEscape =
  (open: boolean, close: () => void, trigger: RefObject<HTMLButtonElement | null>) =>
  (event: KeyboardEvent) => {
    if (!open || event.key !== 'Escape' || event.nativeEvent.cancelBubble) return;
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
