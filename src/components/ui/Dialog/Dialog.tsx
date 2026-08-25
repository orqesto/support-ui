import { useEffect } from 'react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { Button } from '../Button';
import { getDialogOverlayClasses, getDialogContentClasses } from './dialog.styles';
import type { DialogProps, DialogSubComponentProps, DialogCloseProps } from './dialog.types';

export const Dialog = ({
  open,
  onOpenChange,
  children,
  className,
  size = 'md',
  blur = 'none',
  dismissOnOverlayClick = true,
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

  if (!open) return null;

  return createPortal(
    <div className="flex fixed inset-0 z-[60] justify-center items-center">
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
      <div className={cn(getDialogContentClasses(size), className)}>{children}</div>
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
  <h2 className={cn('text-lg font-semibold', className)}>{children}</h2>
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
  <div className={cn('flex gap-2 justify-end items-center p-6 border-t border-border', className)}>
    {children}
  </div>
);
