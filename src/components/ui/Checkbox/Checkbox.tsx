import { forwardRef, useId } from 'react';
import { checkboxVariants } from './checkbox.styles';
import type { CheckboxProps } from './checkbox.types';
import { cn } from '@/lib/utils';

/**
 * The design system had no tick box, so twenty-four settings screens each grew their own raw
 * `<input type="checkbox">` — every one of them outside the theme, the focus ring and the
 * disabled state. This is the component those should converge on; `Toggle` remains the right
 * control for a setting that applies the moment it is flipped.
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, error, size, variant, id, disabled, ...props }, ref) => {
    const generatedId = useId();
    const checkboxId = id ?? generatedId;
    const errorId = `${checkboxId}-error`;

    return (
      <div className={cn('space-y-1', className)}>
        <label
          htmlFor={checkboxId}
          className={cn(
            'flex items-start gap-2 text-sm text-foreground',
            disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'
          )}
        >
          <input
            ref={ref}
            id={checkboxId}
            type="checkbox"
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className={cn(checkboxVariants({ size, variant: error ? 'error' : variant }), 'mt-0.5')}
            {...props}
          />
          {label && <span>{label}</span>}
        </label>
        {error && (
          <p id={errorId} className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Checkbox.displayName = 'Checkbox';
