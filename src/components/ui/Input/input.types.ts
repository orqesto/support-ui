import type { VariantProps } from 'class-variance-authority';
import type { inputVariants } from './input.styles';
import type { InputHTMLAttributes } from 'react';

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> &
  VariantProps<typeof inputVariants> & {
    label?: string;
    error?: string;
    success?: string;
  };
