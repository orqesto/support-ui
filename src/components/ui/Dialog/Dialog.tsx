import { useEffect } from 'react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
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
   */
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

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

  return createPortal(
    <div
      className={cn(
        'flex fixed inset-0 z-[60] justify-center items-center',
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
        role="dialog"
        aria-modal="true"
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
