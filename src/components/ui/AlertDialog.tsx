import { CheckCircle, XCircle, AlertCircle, Info } from 'lucide-react';
import { Button } from './Button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './Dialog';

type AlertDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  variant?: 'success' | 'error' | 'warning' | 'info';
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void | Promise<void>;
};

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
    success: <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />,
    error: <XCircle className="w-6 h-6 text-red-600 dark:text-red-400" />,
    warning: <AlertCircle className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />,
    info: <Info className="w-6 h-6 text-blue-600 dark:text-blue-400" />,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <DialogContent>
        <div className="flex gap-4">
          <div className="flex-shrink-0">{icons[variant]}</div>
          <div className="flex-1">
            <p className="text-sm text-foreground whitespace-pre-wrap">{description}</p>
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
              onClick={async () => {
                await onConfirm();
                onOpenChange(false);
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
