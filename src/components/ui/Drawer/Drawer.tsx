import { X } from 'lucide-react';
import { Button } from '../Button';
import { getDrawerBackdropClasses, getDrawerContentClasses } from './drawer.styles';
import type { DrawerProps } from './drawer.types';

export const Drawer = ({
  open,
  onClose,
  title,
  children,
  footer,
  side = 'right',
  size = 'lg',
  blur = 'none',
}: DrawerProps) => {
  if (!open) return null;

  return (
    <>
      <div
        className={getDrawerBackdropClasses(blur)}
        style={{ zIndex: 40 }}
        onClick={onClose}
        aria-hidden="true"
      />

      <div className={getDrawerContentClasses(side, size)}>
        <div className="flex justify-between items-center p-4 border-b border-border bg-muted">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Button variant="outline" size="sm" onClick={onClose} className="p-0 w-8 h-8">
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="relative overflow-y-auto overflow-x-hidden flex-1 px-6">{children}</div>

        {footer && <div className="p-4 border-t border-border bg-muted">{footer}</div>}
      </div>
    </>
  );
};
