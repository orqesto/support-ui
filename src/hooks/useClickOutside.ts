import { useEffect, type RefObject } from 'react';

/**
 * Close-on-outside for anything that floats: a menu, a popover, a switcher.
 *
 * Fires `onClose` on a mousedown outside `ref` and on Escape, only while `active`. Listeners
 * are attached for the open lifetime only, so a closed menu costs nothing.
 *
 * Nine components hand-rolled this same `document.addEventListener('mousedown', …)` block
 * before it existed (NotificationCenter, VersionStatus, TranslateButton, AllianceSwitcher,
 * FilterTokenBar, MessageDetailHeader, KanbanCard, MessageListItem, TicketDetail). They still
 * do — migrating them is a change of its own — but nothing new should be the tenth copy.
 */
export const useClickOutside = (
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  onClose: () => void
): void => {
  useEffect(() => {
    if (!active) return undefined;
    const onPointer = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref, active, onClose]);
};
