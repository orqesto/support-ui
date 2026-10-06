import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { useModalLayer } from '@/hooks/useModalLayer';
import { Button } from '../Button';
import {
  getDialogOverlayClasses,
  getDialogContentClasses,
  DIALOG_SHEET_CONTENT,
  DIALOG_SHEET_WRAPPER,
} from './dialog.styles';
import type { DialogProps, DialogSubComponentProps, DialogCloseProps } from './dialog.types';

/*
  How many dialogs hold the page still right now, and the page's own `overflow` from before the
  first one opened. Shared across every Dialog so stacked dialogs closing in ONE update (a merge
  closes its picker and its confirm together) restore the page's value whatever order React runs
  their cleanups in — a per-dialog "previous value" restored the outer dialog's 'hidden' last and
  left the phone's document-scrolled page unable to scroll.
*/
/** The dialog layer — see the comment where it is used. Exported for the layer-order test. */
export const DIALOG_LAYER = 'z-[90]';

let scrollLocks = 0;
let overflowBeforeLocks = '';

export const Dialog = ({
  open,
  onOpenChange,
  children,
  className,
  size = 'md',
  blur = 'none',
  dismissOnOverlayClick = true,
  sheetOnPhone = false,
}: DialogProps) => {
  /**
   * Escape closes, listened for on the document rather than on the backdrop.
   *
   * It used to be a handler on the overlay div, which only fired when that div
   * itself had focus — so for any dialog the user was actually typing in, and
   * emphatically for one wrapping a Stripe iframe, Escape did nothing. A dialog
   * that cannot be dismissed from the keyboard is a trap, and that is doubly
   * true for one that deliberately ignores backdrop clicks.
   *
   * Only the TOPMOST open dialog answers it (`useModalLayer`): with a confirm stacked over a
   * picker, one Escape used to close both. The same layer keeps Tab inside the dialog and brings
   * focus in when it opens with focus outside (`aria-modal` promised that; nothing enforced it).
   */
  const contentRef = useRef<HTMLDivElement>(null);
  useModalLayer(contentRef, open, { onEscape: () => onOpenChange(false) });

  /**
   * Hold the page still while a dialog is open.
   *
   * Without this the body scrolls behind the overlay: a wheel gesture aimed at the dialog moves
   * the page underneath instead, and on a tall dialog — a Stripe checkout especially — the
   * content the user is reading slides away from them. Every dialog in the app had this, not
   * just the payment one.
   *
   * The page's own `overflow` is restored rather than assumed to be `''`, so a dialog opened
   * from a page that manages its own scrolling does not leave that page permanently unscrollable
   * after closing. Stacked dialogs share one lock (see `scrollLocks`): the first to open saves
   * the page's value, the last to close puts it back, in any close order.
   */
  useEffect(() => {
    if (!open) return;
    if (scrollLocks === 0) overflowBeforeLocks = document.body.style.overflow;
    scrollLocks += 1;
    document.body.style.overflow = 'hidden';
    return () => {
      scrollLocks -= 1;
      if (scrollLocks === 0) document.body.style.overflow = overflowBeforeLocks;
    };
  }, [open]);

  if (!open) return null;

  /*
    z-[90]: a dialog is opened FROM the page's other layers, so it sits above all of them — the
    mobile top bar (65), the Drawer (backdrop 68, panel 70) and the contact profile panel (75/80).
    At z-60 it opened UNDER an open drawer: KB entry → Edit and ticket → Move department rendered
    behind the drawer's backdrop, and a click on the form closed the drawer (FE audit C-H1).
    Below what opens from inside a dialog (menus, tooltips: 9999) and the subscription gate (100).
  */
  return createPortal(
    <div
      className={cn(
        `flex fixed inset-0 ${DIALOG_LAYER} justify-center items-center`,
        sheetOnPhone && DIALOG_SHEET_WRAPPER
      )}
    >
      {dismissOnOverlayClick ? (
        <button
          type="button"
          className={getDialogOverlayClasses(blur)}
          onClick={() => onOpenChange(false)}
          aria-label="Close dialog"
        />
      ) : (
        /* Not interactive: a stray click must not discard something the user is
           part-way through, such as a half-entered card. Escape still closes. */
        <div className={getDialogOverlayClasses(blur)} />
      )}
      {/* role + aria-modal: screen readers announce it as a dialog, and keyboard handlers
          elsewhere (message detail's single-key shortcuts) can tell a modal owns the keys —
          without it, Escape closed the dialog AND the rail behind it. */}
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        data-sheet-on-phone={sheetOnPhone ? 'true' : undefined}
        className={cn(
          getDialogContentClasses(size),
          className,
          sheetOnPhone && DIALOG_SHEET_CONTENT
        )}
      >
        {children}
      </div>
    </div>,
    document.body
  );
};

export const DialogHeader = ({ className, children }: DialogSubComponentProps) => (
  <div className={cn('flex justify-between items-center p-2 border-b border-border', className)}>
    {children}
  </div>
);

export const DialogTitle = ({ className, children }: DialogSubComponentProps) => (
  <h2 className={cn('font-display text-lg font-semibold', className)}>{children}</h2>
);

export const DialogClose = ({ onClose }: DialogCloseProps) => (
  <Button
    variant="ghost"
    size="sm"
    onClick={onClose}
    aria-label="Close"
    className="rounded-sm opacity-70 transition-opacity hover:opacity-100"
  >
    <X className="w-4 h-4" />
  </Button>
);

export const DialogContent = ({ className, children }: DialogSubComponentProps) => (
  <div className={cn('p-6', className)}>{children}</div>
);

export const DialogFooter = ({ className, children }: DialogSubComponentProps) => (
  <div
    data-dialog-footer
    className={cn('flex gap-2 justify-end items-center p-6 border-t border-border', className)}
  >
    {children}
  </div>
);
