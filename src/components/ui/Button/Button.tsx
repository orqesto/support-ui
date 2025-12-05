import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { getButtonClasses } from './button.styles';
import { LoadingSpinner } from './LoadingSpinner';
import type { ButtonProps } from './button.types';

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, isLoading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(getButtonClasses(variant, size), className)}
      disabled={disabled ?? isLoading}
      {...props}
    >
      {isLoading ? <LoadingSpinner /> : children}
    </button>
  )
);

Button.displayName = 'Button';
