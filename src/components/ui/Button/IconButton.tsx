import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { getButtonClasses } from './button.styles';
import type { ButtonProps } from './button.types';

export type IconButtonProps = Omit<ButtonProps, 'children' | 'isLoading'> & {
  icon: React.ReactNode;
  'aria-label': string; // Required for accessibility
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant, icon, type = 'button', disabled, onClick, ...props }, ref) => {
    // As Button: never natively disabled — a focused button that turns disabled loses keyboard
    // focus (Chrome, staging, 2026-11-03). Out of use: aria-disabled, dimmed, its click cancelled.
    const inactive = disabled === true;
    return (
      // Default type="button" so an IconButton inside a <form> never submits by accident.
      <button
        ref={ref}
        type={type}
        className={cn(getButtonClasses(variant, 'icon'), className)}
        data-inactive={inactive ? '' : undefined}
        {...props}
        aria-disabled={inactive ? true : props['aria-disabled']}
        onClick={
          inactive
            ? (event) => {
                event.preventDefault();
                event.stopPropagation();
              }
            : onClick
        }
      >
        {icon}
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';
