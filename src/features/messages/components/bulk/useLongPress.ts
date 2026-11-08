import {
  useCallback,
  useEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';

/**
 * Touch long-press on an inbox row (owner, 2026-09-28): a phone has no hover, so holding a row
 * is how an agent enters select mode there. It selects the row and must NOT open it.
 *
 * Touch only (`pointerType === 'touch'`): a mouse has hover and a visible box, and a pen that
 * rests on a row is usually aiming, not selecting.
 *
 * Cancelled by moving more than MOVE_TOLERANCE_PX or by any scroll — a finger resting on a row
 * at the start of a swipe must not select it. The browser also sends `pointercancel` when it
 * takes the gesture over for panning.
 *
 * The click that follows a successful long-press is swallowed (capture phase, so neither the
 * row's open-thread handler nor a checkbox underneath sees it). The flag that swallows it is
 * reset on the next pointerdown, so a long-press that produced no click cannot eat a later tap.
 */
export const LONG_PRESS_MS = 450;
export const MOVE_TOLERANCE_PX = 10;

export type LongPressHandlers = {
  onPointerDown?: (event: ReactPointerEvent) => void;
  onPointerMove?: (event: ReactPointerEvent) => void;
  onPointerUp?: () => void;
  onPointerCancel?: () => void;
  onClickCapture?: (event: ReactMouseEvent) => void;
  onContextMenu?: (event: ReactMouseEvent) => void;
};

export const useLongPress = (onLongPress: (() => void) | undefined): LongPressHandlers => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const originRef = useRef<{ left: number; top: number } | null>(null);
  const firedRef = useRef(false);
  const latest = useRef(onLongPress);
  latest.current = onLongPress;

  const cancel = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
    originRef.current = null;
    window.removeEventListener('scroll', cancel, true);
  }, []);

  // A row that unmounts mid-press (a refetch dropped it) must not select itself afterwards.
  useEffect(() => cancel, [cancel]);

  if (!onLongPress) return {};

  return {
    onPointerDown: (event) => {
      firedRef.current = false;
      if (event.pointerType !== 'touch' || !event.isPrimary) return;
      cancel();
      originRef.current = { left: event.clientX, top: event.clientY };
      // Capture: scroll does not bubble, and it is the list or a Kanban column that scrolls.
      window.addEventListener('scroll', cancel, true);
      timerRef.current = setTimeout(() => {
        cancel();
        firedRef.current = true;
        latest.current?.();
      }, LONG_PRESS_MS);
    },
    onPointerMove: (event) => {
      const origin = originRef.current;
      if (!origin) return;
      const distance = Math.hypot(event.clientX - origin.left, event.clientY - origin.top);
      if (distance > MOVE_TOLERANCE_PX) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onClickCapture: (event) => {
      if (!firedRef.current) return;
      firedRef.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
    // The OS long-press menu (Android) arrives around the same moment; during or after a press
    // that is selecting a row it would cover the row the agent just picked.
    onContextMenu: (event) => {
      if (firedRef.current || timerRef.current !== null) event.preventDefault();
    },
  };
};
