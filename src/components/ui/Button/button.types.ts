import type { VariantProps } from 'class-variance-authority';
import type { buttonVariants } from './button.styles';
import type { ButtonHTMLAttributes } from 'react';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    isLoading?: boolean;
  };
