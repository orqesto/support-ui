import type { ReactNode } from 'react';
import type { ButtonProps } from '@/components/ui/Button';

export type FilePickerProps = {
  /** The `accept` list of the browser's chooser, e.g. `image/png,image/jpeg`. */
  accept: string;
  /** Accessible name of the (hidden) file field. */
  label: string;
  /** The chosen file; the field is reset after, so choosing the same file again works. */
  onPick: (file: File) => void;
  disabled?: boolean;
  /** The button's content. */
  children: ReactNode;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
};
