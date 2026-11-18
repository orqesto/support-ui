import { useRef } from 'react';
import { Button } from '@/components/ui/Button';
import { filePickerInputClass } from './filePicker.styles';
import type { FilePickerProps } from './filePicker.types';

/**
 * Choose a file with a design-system Button: the browser's own chooser opens from a hidden file
 * field (a file can only be picked through one). Use this instead of a raw `<input type="file">`.
 */
export const FilePicker = ({
  accept,
  label,
  onPick,
  disabled,
  children,
  variant = 'outline',
  size = 'sm',
}: FilePickerProps) => {
  const field = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={field}
        type="file"
        accept={accept}
        aria-label={label}
        // Reached only through the Button: never a second control for the keyboard or a reader.
        aria-hidden="true"
        tabIndex={-1}
        disabled={disabled}
        className={filePickerInputClass}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) onPick(file);
        }}
      />
      <Button
        size={size}
        variant={variant}
        disabled={disabled}
        onClick={() => field.current?.click()}
      >
        {children}
      </Button>
    </>
  );
};
