import { useRef } from 'react';
import { cn } from '@/lib/utils';
import { resizeGripClass, resizeHandleClass } from './resizeHandle.styles';
import type { ResizeHandleProps } from './resizeHandle.types';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * A drag bar that resizes something along one axis — by pointer (mouse, pen, touch), by the arrow
 * keys once focused, back to the default on double-click or Home. A `separator` with its value, so
 * a screen reader announces the size; the parent owns the size and where it is remembered.
 */
export const ResizeHandle = ({
  value,
  min,
  max,
  onChange,
  onCommit,
  onReset,
  grows = 'up',
  step = 24,
  ariaLabel,
  className,
}: ResizeHandleProps) => {
  const drag = useRef<{ startY: number; startValue: number; last: number } | null>(null);
  const sign = grows === 'up' ? -1 : 1;

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label={ariaLabel}
      aria-valuenow={Math.round(value)}
      aria-valuemin={Math.round(min)}
      aria-valuemax={Math.round(max)}
      tabIndex={0}
      data-testid="resize-handle"
      className={cn(resizeHandleClass, className)}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        drag.current = { startY: event.clientY, startValue: value, last: value };
      }}
      onPointerMove={(event) => {
        const state = drag.current;
        if (!state) return;
        const next = clamp(state.startValue + sign * (event.clientY - state.startY), min, max);
        state.last = next;
        onChange(next);
      }}
      onPointerUp={(event) => {
        const state = drag.current;
        if (!state) return;
        drag.current = null;
        event.currentTarget.releasePointerCapture?.(event.pointerId);
        onCommit?.(state.last);
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onDoubleClick={() => onReset?.()}
      onKeyDown={(event) => {
        // ArrowUp grows a box that grows upward — the direction the bar moves.
        const delta =
          event.key === 'ArrowUp' ? -sign * step : event.key === 'ArrowDown' ? sign * step : 0;
        if (event.key === 'Home' && onReset) {
          event.preventDefault();
          onReset();
          return;
        }
        if (!delta) return;
        event.preventDefault();
        const next = clamp(value + delta, min, max);
        onChange(next);
        onCommit?.(next);
      }}
    >
      <span aria-hidden className={resizeGripClass} />
    </div>
  );
};
