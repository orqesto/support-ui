import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

/** Gap kept between the panel and either edge of the visible page. */
const EDGE_MARGIN_PX = 8;

type PopoverProps = {
  trigger: (state: { open: boolean; toggle: () => void }) => React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Names the panel (a non-modal `role="dialog"`). */
  ariaLabel: string;
  /** The panel's drawn width — what it is clamped on screen with. */
  width: number;
  align?: 'start' | 'end';
  className?: string;
  children: React.ReactNode;
};

/**
 * A caller's trigger opens a panel of any content: `SelectPopover`'s placement without its list.
 * Portalled to <body> so a clipped or scrolling container cannot cut it, clamped to the width you
 * can SEE (`clientWidth`, not `innerWidth`, see SelectPopover), and flipped above the trigger when
 * it fits there and not below. Escape or a press outside closes it; Escape returns the focus to the
 * trigger.
 */
export const Popover = ({
  trigger,
  open,
  onOpenChange,
  ariaLabel,
  width,
  align = 'start',
  className,
  children,
}: PopoverProps) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !rootRef.current) {
      setPos(null);
      return undefined;
    }
    const place = (event?: Event) => {
      if (event?.target instanceof Node && panelRef.current?.contains(event.target)) return;
      if (!rootRef.current) return;
      const rect = rootRef.current.getBoundingClientRect();
      const visibleWidth = document.documentElement.clientWidth;
      const wanted = align === 'end' ? rect.right - width : rect.left;
      const inView = Math.max(EDGE_MARGIN_PX, Math.min(wanted, visibleWidth - width - EDGE_MARGIN_PX));
      const height = panelRef.current?.offsetHeight ?? 0;
      const below = document.documentElement.clientHeight - rect.bottom - 4;
      const above = rect.top - 4;
      const top =
        height <= below || above <= below
          ? rect.bottom + window.scrollY + 4
          : rect.top - height + window.scrollY - 4;
      const next = { top, left: inView + window.scrollX };
      setPos((prev) => (prev && prev.top === next.top && prev.left === next.left ? prev : next));
    };
    place();
    // The first pass has no panel to measure; place again once it is drawn.
    const frame = window.requestAnimationFrame(() => place());
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, align, width]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      onOpenChange(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open, onOpenChange]);

  const closeToTrigger = () => {
    onOpenChange(false);
    const target = rootRef.current?.querySelector<HTMLElement>('button, [tabindex]:not([tabindex="-1"])');
    window.setTimeout(() => target?.focus({ preventScroll: true }));
  };

  return (
    <div ref={rootRef} className={cn('inline-block', className)}>
      {trigger({ open, toggle: () => onOpenChange(!open) })}
      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={ariaLabel}
            style={{
              position: 'absolute',
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              width,
              visibility: pos ? 'visible' : 'hidden',
            }}
            className="z-50 rounded-md border border-border bg-popover text-popover-foreground shadow-md"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                closeToTrigger();
              }
            }}
          >
            {children}
          </div>,
          document.body
        )}
    </div>
  );
};
