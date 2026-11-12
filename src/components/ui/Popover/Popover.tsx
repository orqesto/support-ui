import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

/** Gap kept between the panel and either edge of the visible page. */
const EDGE_MARGIN_PX = 8;

/**
 * A modal dialog is open ABOVE the popover — one it does not sit in. While it is, a press anywhere
 * (its content or its backdrop, which is outside it) is the dialog's, not a "press outside": a
 * question opened from the panel ("a colleague is writing — assign anyway?") must close alone (one
 * press, one layer; see useModalLayer). A modal the popover sits in (a date picker in a dialog) is
 * not above it.
 */
const modalIsAbove = (root: HTMLElement | null): boolean =>
  Array.from(document.querySelectorAll('[aria-modal="true"]')).some(
    (modal) => !modal.contains(root)
  );

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
 * it fits there and not below. A press outside closes it (not while a modal dialog is open above it).
 *
 * Escape closes it from the trigger or the panel, focus back on the trigger. It is caught in React
 * and stopped there, so the page's own Escape (close the open thread, clear a selection — document
 * and window listeners) never sees it. An Escape that something inside already handled (the Select
 * closing its open list stops it) is left alone, and so is one pressed with the focus elsewhere: it
 * belongs to what has the focus. One press, one layer.
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

  const closeToTrigger = () => {
    onOpenChange(false);
    const target = rootRef.current?.querySelector<HTMLElement>(
      'button, [tabindex]:not([tabindex="-1"])'
    );
    window.setTimeout(() => target?.focus({ preventScroll: true }));
  };

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
      const inView = Math.max(
        EDGE_MARGIN_PX,
        Math.min(wanted, visibleWidth - width - EDGE_MARGIN_PX)
      );
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

  // Opening moves the focus into the panel: it is portalled to the end of <body>, so Tab from the
  // trigger would never reach it.
  useEffect(() => {
    if (!open) return;
    panelRef.current
      ?.querySelector<HTMLElement>(
        'button:not([disabled]):not([aria-disabled="true"]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])'
      )
      ?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      if (modalIsAbove(rootRef.current)) return;
      onOpenChange(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open, onOpenChange]);

  const onEscapeInside = (event: React.KeyboardEvent) => {
    if (!open || event.key !== 'Escape' || event.nativeEvent.cancelBubble) return;
    event.preventDefault();
    event.stopPropagation();
    closeToTrigger();
  };

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- catches Escape for its trigger
    <div ref={rootRef} className={cn('inline-block', className)} onKeyDown={onEscapeInside}>
      {trigger({ open, toggle: () => onOpenChange(!open) })}
      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={ariaLabel}
            onKeyDown={onEscapeInside}
            style={{
              position: 'absolute',
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              width,
              visibility: pos ? 'visible' : 'hidden',
            }}
            className="z-[9999] rounded-md border border-border bg-popover text-popover-foreground shadow-md"
          >
            {children}
          </div>,
          document.body
        )}
    </div>
  );
};
