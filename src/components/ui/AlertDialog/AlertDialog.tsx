import { CheckCircle, XCircle, AlertCircle, Info } from 'lucide-react';
import { Button } from '../Button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../Dialog';
import { getAlertDialogIconClasses } from './alertDialog.styles';
import type { AlertDialogProps } from './alertDialog.types';

export const AlertDialog = ({
  open,
  onOpenChange,
  title,
  description,
  variant = 'info',
  confirmText = 'OK',
  cancelText = 'Cancel',
  onConfirm,
}: AlertDialogProps) => {
  const icons = {
    success: CheckCircle,
    error: XCircle,
    warning: AlertCircle,
    info: Info,
  };

  const Icon = icons[variant ?? 'info'];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <DialogContent>
        <div className="flex gap-4">
          <div className="flex-shrink-0">
            <Icon className={getAlertDialogIconClasses(variant)} />
          </div>
          <div className="flex-1">
            <p className="text-sm whitespace-pre-wrap text-foreground">{description}</p>
          </div>
        </div>
      </DialogContent>
      <DialogFooter>
        {onConfirm ? (
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {cancelText}
            </Button>
            <Button
              onClick={() => {
                // 🪤 Close FIRST, then run the handler. Awaiting and closing afterwards
                // clobbers whatever the handler opened in the meantime: PricingPage's
                // `confirmUpgrade` shows an error dialog from its catch, and this line
                // closed it again the instant it appeared — a failed plan upgrade told
                // the user nothing at all. `ConfirmDialog` already invokes without
                // awaiting, which is why it never had this.
                onOpenChange(false);
                void onConfirm();
              }}
            >
              {confirmText}
            </Button>
          </>
        ) : (
          <Button onClick={() => onOpenChange(false)}>{confirmText}</Button>
        )}
      </DialogFooter>
    </Dialog>
  );
};
