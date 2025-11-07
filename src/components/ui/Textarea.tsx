import { forwardRef, useId, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  error?: string;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, id, ...props }, ref) => {
    const generatedId = useId();
    const textareaId = id ?? generatedId;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={textareaId} className="block mb-2 text-sm font-medium">
            {label}
          </label>
        )}
        <textarea
          id={textareaId}
          className={cn(
            'flex min-h-[120px] w-full rounded-md border border-border bg-input text-foreground px-3 py-2 text-sm',
            'placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-2 focus:ring-primary',
            'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted',
            'resize-y',
            error && 'border-destructive focus:ring-destructive',
            className
          )}
          ref={ref}
          {...props}
        />
        {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
