import type { VariantProps } from 'class-variance-authority';
import type { alertDialogIconVariants } from './alertDialog.styles';

export type AlertDialogProps = VariantProps<typeof alertDialogIconVariants> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void | Promise<void>;
};
