import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './Button';

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
};

export const Dialog = ({ open, onOpenChange, children }: DialogProps) => {
  if (!open) {
    return null;
  }

  return (
    <div className="flex fixed inset-0 z-50 justify-center items-center">
      <div
        role="button"
        tabIndex={0}
        className="fixed inset-0 bg-black/50"
        onClick={() => onOpenChange(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' || e.key === 'Enter') {
            onOpenChange(false);
          }
        }}
        aria-label="Close dialog"
      />
      <div className="relative bg-card rounded-lg shadow-lg max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        {children}
      </div>
    </div>
  );
};

export const DialogHeader = ({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) => (
  <div className={cn('flex justify-between items-center p-6 border-b border-border', className)}>
    {children}
  </div>
);

export const DialogTitle = ({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) => <h2 className={cn('text-lg font-semibold', className)}>{children}</h2>;

export const DialogClose = ({ onClose }: { onClose: () => void }) => (
  <Button
    variant="ghost"
    size="sm"
    onClick={onClose}
    className="rounded-sm opacity-70 transition-opacity hover:opacity-100"
  >
    <X className="w-4 h-4" />
  </Button>
);

export const DialogContent = ({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) => <div className={cn('p-6', className)}>{children}</div>;

export const DialogFooter = ({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) => (
  <div className={cn('flex gap-2 justify-end items-center p-6 border-t border-border', className)}>
    {children}
  </div>
);
