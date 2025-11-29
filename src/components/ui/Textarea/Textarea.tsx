import { forwardRef, useId } from 'react';
import { cn } from '@/lib/utils';
import {
  getTextareaClasses,
  getTextareaLabelClasses,
  getTextareaErrorClasses,
} from './textarea.styles';
import type { TextareaProps } from './textarea.types';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, success, size, variant, resize, id, ...props }, ref) => {
    const generatedId = useId();
    const textareaId = id ?? generatedId;

    // Auto-set variant based on error/success
    const finalVariant = error ? 'error' : success ? 'success' : variant;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={textareaId} className={getTextareaLabelClasses(size)}>
            {label}
          </label>
        )}
        <textarea
          id={textareaId}
          className={cn(getTextareaClasses(size, finalVariant, resize), className)}
          ref={ref}
          {...props}
        />
        {error && <p className={getTextareaErrorClasses(size)}>{error}</p>}
        {success && !error && (
          <p className={cn(getTextareaErrorClasses(size), 'text-green-600 dark:text-green-400')}>
            {success}
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
