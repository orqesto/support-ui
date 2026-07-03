import { forwardRef, useId } from 'react';
import { cn } from '@/lib/utils';
import { getInputClasses, getInputLabelClasses, getInputErrorClasses } from './input.styles';
import type { InputProps } from './input.types';

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, error, success, size, variant, id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const errorId = `${inputId}-error`;

    // Auto-set variant based on error/success
    const finalVariant = error ? 'error' : success ? 'success' : variant;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className={getInputLabelClasses(size)}>
            {label}
          </label>
        )}
        <input
          id={inputId}
          type={type}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={cn(getInputClasses(size, finalVariant), className)}
          ref={ref}
          {...props}
        />
        {error && (
          <p id={errorId} className={getInputErrorClasses(size)}>
            {error}
          </p>
        )}
        {success && !error && (
          <p className={cn(getInputErrorClasses(size), 'text-green-600 dark:text-green-400')}>
            {success}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
