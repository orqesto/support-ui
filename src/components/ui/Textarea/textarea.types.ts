import type { VariantProps } from 'class-variance-authority';
import type { textareaVariants } from './textarea.styles';
import type { TextareaHTMLAttributes } from 'react';

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> &
  VariantProps<typeof textareaVariants> & {
    label?: string;
    error?: string;
    success?: string;
  };
