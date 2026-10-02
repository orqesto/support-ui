import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getTooltipClasses } from './tooltip.styles';
import type { TooltipProps } from './tooltip.types';

type Coords = { top: number; left: number };

// Inline transforms by side. Keeping them out of CVA because the side variant
// now only signals positioning intent to JS — the actual placement happens via
// `position: fixed` in a body-level portal so the tip can't be clipped by an
// ancestor with `overflow: hidden` (kanban cards, scrolling containers, etc.).
const TRANSFORM_BY_SIDE: Record<NonNullable<TooltipProps['side']>, string> = {
  top: 'translate(-50%, -100%)',
  bottom: 'translate(-50%, 0)',
  left: 'translate(-100%, -50%)',
  right: 'translate(0, -50%)',
};

/*
  Elements being focused by `focusWithoutTooltip` right now. A tooltip with `quietFocus` does not
  open for that one focus — a component handing focus BACK after a mouse press (a popover closed
  by an outside click) should not flash a tooltip the user never pointed at. Held only for the
  duration of the synchronous `focus()` call, so a later real focus is never swallowed.
*/
const quietTargets = new WeakSet<EventTarget>();

/** Focus `el` without opening a `quietFocus` tooltip around it (every other tooltip: unchanged). */
export const focusWithoutTooltip = (el: HTMLElement): void => {
  quietTargets.add(el);
  try {
    el.focus({ preventScroll: true });
  } finally {
    quietTargets.delete(el);
  }
};

const GAP_PX = 6;
const VIEWPORT_MARGIN_PX = 4;

export const Tooltip = ({
  content,
  children,
  side = 'top',
  size = 'md',
  delayDuration = 200,
  className = 'inline-flex',
  quietFocus = false,
}: TooltipProps) => {
  const [isVisible, setIsVisible] = useState(false);
  // The unshifted anchor from the trigger; `shiftX` is the edge clamp applied on top of it.
  const [coords, setCoords] = useState<Coords | null>(null);
  const [shiftX, setShiftX] = useState(0);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const timeoutRef = useRef<number | null>(null);
  // A tooltip that goes away mid-delay (its trigger unmounted) must not fire into nothing.
  useEffect(
    () => () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    },
    []
  );

  const computeCoords = useCallback((): Coords | null => {
    if (!triggerRef.current) return null;
    const rect = triggerRef.current.getBoundingClientRect();
    switch (side) {
      case 'bottom':
        return { top: rect.bottom + GAP_PX, left: rect.left + rect.width / 2 };
      case 'left':
        return { top: rect.top + rect.height / 2, left: rect.left - GAP_PX };
      case 'right':
        return { top: rect.top + rect.height / 2, left: rect.right + GAP_PX };
      case 'top':
      default:
        return { top: rect.top - GAP_PX, left: rect.left + rect.width / 2 };
    }
  }, [side]);

  const show = () => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      const next = computeCoords();
      if (next) setCoords(next);
      setIsVisible(true);
    }, delayDuration);
  };

  const hide = () => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsVisible(false);
  };

  // After the portal renders we know the tooltip's real width. If the box would spill past either
  // viewport edge, shift it horizontally so it sits flush against the margin instead. Only relevant
  // for top/bottom sides — left/right don't horizontally clamp the same way.
  //
  // The shift is computed from the UNSHIFTED anchor (`coords`) and the box's width — never from where
  // the box currently sits — so it is idempotent: a second run yields the same shift and React bails
  // out. (Measuring the current box and nudging `coords` again did not converge where the box never
  // moves, e.g. jsdom's 0×0 layout: +4 px per render until "Maximum update depth exceeded".) The tip
  // is `whitespace-nowrap`, so its width does not depend on where it is placed, and the
  // `translate(-50%, …)` of top/bottom puts its left edge at `anchor - width / 2`.
  useLayoutEffect(() => {
    if (!isVisible || !tooltipRef.current || !coords) return;
    if (side !== 'top' && side !== 'bottom') {
      setShiftX(0);
      return;
    }
    const { width } = tooltipRef.current.getBoundingClientRect();
    const left = coords.left - width / 2;
    const right = left + width;
    let next = 0;
    if (left < VIEWPORT_MARGIN_PX) {
      next = VIEWPORT_MARGIN_PX - left;
    } else if (right > window.innerWidth - VIEWPORT_MARGIN_PX) {
      next = window.innerWidth - VIEWPORT_MARGIN_PX - right;
    }
    setShiftX(next);
  }, [isVisible, coords, side]);

  return (
    <span
      ref={triggerRef}
      role="presentation"
      className={className}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={(event) => {
        if (quietFocus && quietTargets.has(event.target)) return;
        show();
      }}
      onBlur={hide}
    >
      {children}
      {isVisible &&
        content &&
        coords &&
        typeof document !== 'undefined' &&
        createPortal(
          <span
            ref={tooltipRef}
            role="tooltip"
            className={getTooltipClasses(side, size)}
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left + shiftX,
              transform: TRANSFORM_BY_SIDE[side ?? 'top'],
            }}
          >
            {content}
          </span>,
          document.body
        )}
    </span>
  );
};
