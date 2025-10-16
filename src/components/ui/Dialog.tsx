import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
};

export const Dialog = ({ open, onOpenChange, children }: DialogProps) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="fixed inset-0 bg-black/50"
        onClick={() => onOpenChange(false)}
      />
      <div className="relative bg-white rounded-lg shadow-lg max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        {children}
      </div>
    </div>
  );
};

export const DialogHeader = ({ className, children }: { className?: string; children: ReactNode }) => (
  <div className={cn('flex items-center justify-between p-6 border-b', className)}>
    {children}
  </div>
);

export const DialogTitle = ({ children }: { children: ReactNode }) => (
  <h2 className="text-lg font-semibold">{children}</h2>
);

export const DialogClose = ({ onClose }: { onClose: () => void }) => (
  <button
    onClick={onClose}
    className="rounded-sm opacity-70 hover:opacity-100 transition-opacity"
  >
    <X className="h-4 w-4" />
  </button>
);

export const DialogContent = ({ className, children }: { className?: string; children: ReactNode }) => (
  <div className={cn('p-6', className)}>{children}</div>
);

export const DialogFooter = ({ className, children }: { className?: string; children: ReactNode }) => (
  <div className={cn('flex items-center justify-end gap-2 p-6 border-t', className)}>
    {children}
  </div>
);
