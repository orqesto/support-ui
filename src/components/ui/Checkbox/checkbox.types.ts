import type { VariantProps } from 'class-variance-authority';
import type { checkboxVariants } from './checkbox.styles';
import type { InputHTMLAttributes, ReactNode } from 'react';

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> &
  VariantProps<typeof checkboxVariants> & {
    /**
     * The text beside the box. A ReactNode, not a string: a consent statement is usually a
     * sentence with emphasis in it, and forcing it through a string prop pushes callers back to
     * a hand-rolled label — which is the drift this component exists to stop.
     */
    label?: ReactNode;
    /** Shown under the label, in the destructive colour. Also marks the box as invalid. */
    error?: string;
  };
