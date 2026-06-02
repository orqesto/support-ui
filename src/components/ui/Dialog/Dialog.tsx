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
}: DialogProps) => {
  if (!open) return null;

  return createPortal(
    <div className="flex fixed inset-0 z-[60] justify-center items-center">
      <div
        role="button"
        tabIndex={0}
        className={getDialogOverlayClasses(blur)}
        onClick={() => onOpenChange(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' || event.key === 'Enter') {
            onOpenChange(false);
          }
        }}
        aria-label="Close dialog"
      />
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
