import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
};

export const Drawer = ({ open, onClose, title, children, footer }: DrawerProps) => {
  if (!open) {
    return null;
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 transition-opacity bg-black/50 cursor-pointer"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div className="flex overflow-hidden fixed inset-y-0 right-0 z-50 flex-col w-full  max-w-2xl shadow-xl bg-background animate-slide-in m-0">
    
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-border bg-muted">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Button variant="outline" size="sm" onClick={onClose} className="p-0 w-8 h-8">
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="relative overflow-y-auto overflow-x-hidden flex-1 p-6">{children}</div>

        {/* Footer */}
        {footer && <div className="p-4 border-t border-border bg-muted">{footer}</div>}
      </div>
    </>
  );
};
