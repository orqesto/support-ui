import { forwardRef, useId, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  error?: string;
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, id, children, ...props }, ref) => {
    const generatedId = useId();
    const selectId = id ?? generatedId;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={selectId} className="block mb-2 text-sm font-medium">
            {label}
          </label>
        )}
        <div className="relative z-10">
          <select
            id={selectId}
            className={cn(
              'flex h-10 w-full rounded-md border border-border bg-input text-foreground px-3 py-2 pr-10 text-sm',
              'focus:outline-none focus:ring-2 focus:ring-primary focus:z-50',
              'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted',
              'appearance-none relative', // Hide native dropdown arrow
              error && 'border-destructive focus:ring-destructive',
              className
            )}
            ref={ref}
            {...props}
          >
            {children}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 w-4 h-4 -translate-y-1/2 pointer-events-none text-muted-foreground z-20" />
        </div>
        {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
      </div>
    );
  }
);

Select.displayName = 'Select';
