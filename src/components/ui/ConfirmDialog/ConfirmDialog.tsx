import { AlertTriangle } from 'lucide-react';
import { Button } from '../Button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../Dialog';
import { getConfirmDialogIconClasses, getConfirmDialogButtonClasses } from './confirmDialog.styles';
import type { ConfirmDialogProps } from './confirmDialog.types';

export const ConfirmDialog = ({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
}: ConfirmDialogProps) => {
  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex gap-4">
          <div className="flex-shrink-0">
            <AlertTriangle className={getConfirmDialogIconClasses(variant)} />
          </div>
          <div className="flex-1">
            <p className="text-sm text-foreground">{description}</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {cancelText}
          </Button>
          <Button onClick={handleConfirm} className={getConfirmDialogButtonClasses(variant)}>
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
