import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { getButtonClasses } from './button.styles';
import type { ButtonProps } from './button.types';

export type IconButtonProps = Omit<ButtonProps, 'children' | 'isLoading'> & {
  icon: React.ReactNode;
  'aria-label': string; // Required for accessibility
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant, icon, ...props }, ref) => (
    <button ref={ref} className={cn(getButtonClasses(variant, 'icon'), className)} {...props}>
      {icon}
    </button>
  )
);

IconButton.displayName = 'IconButton';
