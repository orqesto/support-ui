import { useEffect, useRef, useState } from 'react';
import { focusWithoutTooltip } from '@/components/ui/Tooltip';

export type FocusReturnTarget = 'tickets' | 'merges' | 'more';

/**
 * Focus return. Closing a Related popover (Esc, an outside press, its chip), a picker opened
 * from one, or the More menu removes the element that had focus — and focus fell to <body>.
 * It goes back to the control that opened it: the chip, or More (also the stand-in when the
 * chip itself is gone — its last ticket removed, its last merge undone).
 * ⛔ Only when focus is LOST: an outside press that landed on another control (the composer, a
 * link) keeps it there. Checked a task later, after the browser has finished moving focus for
 * the press, and only once no picker or other modal is still up.
 */
export const useHeaderFocusReturn = ({
  addToTicketOpen,
  mergePickerOpen,
}: {
  /** A picker is up: focus waits for it to close. */
  addToTicketOpen: boolean;
  mergePickerOpen: boolean;
}) => {
  const ticketChipRef = useRef<HTMLButtonElement>(null);
  const mergedChipRef = useRef<HTMLButtonElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const [focusReturn, setFocusReturn] = useState<FocusReturnTarget | null>(null);
  /*
    How the last interaction began — a press or a key. Read when focus is handed back (below).
    Capture phase, so a handler that stops propagation cannot hide a press from it.
  */
  const lastInputWasPointer = useRef(false);
  useEffect(() => {
    const onPointer = () => {
      lastInputWasPointer.current = true;
    };
    const onKey = () => {
      lastInputWasPointer.current = false;
    };
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('mousedown', onPointer, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('mousedown', onPointer, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, []);
  useEffect(() => {
    if (focusReturn === null || addToTicketOpen || mergePickerOpen) return;
    const modalUp = () => document.querySelector('[aria-modal="true"]') !== null;
    let observer: MutationObserver | null = null;
    let settle: ReturnType<typeof setTimeout> | null = null;
    const giveBack = () => {
      setFocusReturn(null);
      const active = document.activeElement;
      if (active && active !== document.body && active.isConnected) return;
      const chip =
        focusReturn === 'tickets'
          ? ticketChipRef.current
          : focusReturn === 'merges'
            ? mergedChipRef.current
            : null;
      const target = chip ?? moreButtonRef.current;
      if (!target) return;
      /*
        A press closed it (an outside click, the host dialog's Cancel): focus comes back so the
        keyboard has somewhere to start, but the chip's tooltip is not flashed at a mouse user who
        never asked for it. A key closed it (Esc): the tooltip shows, as for any keyboard focus.
      */
      if (lastInputWasPointer.current) focusWithoutTooltip(target);
      else target.focus({ preventScroll: true });
    };
    const timer = setTimeout(() => {
      if (!modalUp()) {
        giveBack();
        return;
      }
      /*
        A HOST modal opened from here (More → Delete message on the full page): focus cannot go
        back while it is up — and when it closes on Cancel, its button goes and focus falls to
        <body>. So wait for it to leave, then apply the same rule. Subtree: a modal need not be
        a direct child of <body>, and an observer that never fires would leave a stale return.
      */
      observer = new MutationObserver(() => {
        if (modalUp()) return;
        observer?.disconnect();
        observer = null;
        settle = setTimeout(giveBack, 0);
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }, 0);
    return () => {
      clearTimeout(timer);
      if (settle !== null) clearTimeout(settle);
      observer?.disconnect();
    };
  }, [focusReturn, addToTicketOpen, mergePickerOpen]);

  return { ticketChipRef, mergedChipRef, moreButtonRef, setFocusReturn };
};
