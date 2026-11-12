import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { IconButton } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

/*
  A lane's row of cards when the board stacks its lanes (rows layout). A mouse has no sideways
  wheel, and a row of six cards showed two and a cut third, so:
  - drag the row sideways (on a card too): it scrolls. Moving a card to another lane is a drag
    UP or DOWN to another row, so the two never meet — the board's drag sensor starts only on a
    vertical move and gives way to a sideways one (useKanbanDrag);
  - ‹ › arrows at the edges while there is more that way (on hover; always on touch), a card's
    width per press;
  - a fade at the edge that has more.
  When the strip is a column (the columns layout) it does nothing of this.
*/

const PAN_START_PX = 8;
const CARD_STEP_PX = 268;

/** A press on a control inside a card is the control's, never a pan. */
const isControl = (target: EventTarget | null): boolean =>
  target instanceof Element &&
  target.closest('button, a, input, select, textarea, [role="checkbox"], [contenteditable]') !==
    null;

export const HorizontalPanStrip = ({
  className,
  wrapperClassName,
  children,
}: {
  className?: string;
  wrapperClassName?: string;
  children: ReactNode;
}) => {
  const stripRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const sideways = getComputedStyle(strip).flexDirection.startsWith('row');
    const max = strip.scrollWidth - strip.clientWidth;
    const next = {
      start: sideways && strip.scrollLeft > 1,
      end: sideways && strip.scrollLeft < max - 1,
    };
    setEdges((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
  }, []);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return undefined;
    measure();
    strip.addEventListener('scroll', measure, { passive: true });
    if (typeof ResizeObserver === 'undefined') {
      return () => strip.removeEventListener('scroll', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(strip);
    return () => {
      strip.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [measure]);
  // Cards arrive and leave (load more, a move): the edges change with them.
  useEffect(measure);

  const pan = useRef<{ x: number; y: number; left: number; panning: boolean } | null>(null);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const strip = stripRef.current;
    if (!strip || event.pointerType !== 'mouse' || event.button !== 0 || isControl(event.target))
      return;
    if (!getComputedStyle(strip).flexDirection.startsWith('row')) return;
    if (strip.scrollWidth <= strip.clientWidth) return;
    pan.current = { x: event.clientX, y: event.clientY, left: strip.scrollLeft, panning: false };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const strip = stripRef.current;
    const state = pan.current;
    if (!strip || !state) return;
    const dx = event.clientX - state.x;
    const dy = event.clientY - state.y;
    if (!state.panning) {
      if (Math.abs(dy) > PAN_START_PX && Math.abs(dy) >= Math.abs(dx)) {
        // Up or down: a card being moved to another lane, not a pan.
        pan.current = null;
        return;
      }
      if (Math.abs(dx) <= PAN_START_PX) return;
      state.panning = true;
      strip.setPointerCapture?.(event.pointerId);
      strip.dataset.panning = '';
    }
    strip.scrollLeft = state.left - dx;
  };

  const endPan = (event: React.PointerEvent<HTMLDivElement>) => {
    const strip = stripRef.current;
    const state = pan.current;
    pan.current = null;
    if (!strip || !state?.panning) return;
    strip.releasePointerCapture?.(event.pointerId);
    delete strip.dataset.panning;
    // The click that ends a pan is not a click on the card under it.
    const swallow = (click: MouseEvent) => {
      click.stopPropagation();
      click.preventDefault();
    };
    strip.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => strip.removeEventListener('click', swallow, { capture: true }), 0);
  };

  const step = (direction: 1 | -1) =>
    stripRef.current?.scrollBy({ left: direction * CARD_STEP_PX, behavior: 'smooth' });

  return (
    <div className={cn('group/strip relative min-h-0 flex flex-col', wrapperClassName)}>
      <div
        ref={stripRef}
        className={cn(className, 'data-[panning]:cursor-grabbing data-[panning]:select-none')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
      >
        {children}
      </div>
      {edges.start && (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-background/90 to-transparent"
          />
          <IconButton
            icon={<ChevronLeft className="w-4 h-4" />}
            aria-label="Scroll the lane left"
            variant="outline"
            onClick={() => step(-1)}
            className="absolute left-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-card shadow-sm opacity-0 group-hover/strip:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
          />
        </>
      )}
      {edges.end && (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background/90 to-transparent"
          />
          <IconButton
            icon={<ChevronRight className="w-4 h-4" />}
            aria-label="Scroll the lane right"
            variant="outline"
            onClick={() => step(1)}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-card shadow-sm opacity-0 group-hover/strip:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
          />
        </>
      )}
    </div>
  );
};
