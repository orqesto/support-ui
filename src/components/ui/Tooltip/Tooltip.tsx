import { useCallback, useLayoutEffect, useRef, useState } from 'react';
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

const GAP_PX = 6;
const VIEWPORT_MARGIN_PX = 4;

export const Tooltip = ({
  content,
  children,
  side = 'top',
  size = 'md',
  delayDuration = 200,
}: TooltipProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const timeoutRef = useRef<number | null>(null);

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

  // After the portal renders we know the tooltip's real bounding box.
  // If it spills past either viewport edge, shift the anchor `left` so the
  // box sits flush against the margin instead. Only relevant for top/bottom
  // sides — left/right don't horizontally clamp the same way.
  useLayoutEffect(() => {
    if (!isVisible || !tooltipRef.current || !coords) return;
    if (side !== 'top' && side !== 'bottom') return;
    const tip = tooltipRef.current.getBoundingClientRect();
    let nextLeft = coords.left;
    if (tip.left < VIEWPORT_MARGIN_PX) {
      nextLeft = coords.left + (VIEWPORT_MARGIN_PX - tip.left);
    } else if (tip.right > window.innerWidth - VIEWPORT_MARGIN_PX) {
      nextLeft = coords.left - (tip.right - (window.innerWidth - VIEWPORT_MARGIN_PX));
    }
    if (nextLeft !== coords.left) {
      setCoords({ ...coords, left: nextLeft });
    }
  }, [isVisible, coords, side]);

  return (
    <span
      ref={triggerRef}
      role="presentation"
      className="inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
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
              left: coords.left,
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
