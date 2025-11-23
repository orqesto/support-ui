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
        <div className="relative">
          <select
            id={selectId}
            className={cn(
              'flex h-10 w-full rounded-md border border-border bg-input text-foreground px-3 py-2 text-sm',
              'focus:outline-none focus:ring-2 focus:ring-primary',
              'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted',
              // On mobile (touch devices), use native select styling for proper picker positioning
              // On desktop, hide native arrow and show custom chevron
              'sm:appearance-none sm:pr-10',
              error && 'border-destructive focus:ring-destructive',
              className
            )}
            ref={ref}
            {...props}
          >
            {children}
          </select>
          {/* Custom chevron - hidden on mobile, visible on desktop */}
          <ChevronDown className="hidden absolute right-3 top-1/2 w-4 h-4 -translate-y-1/2 pointer-events-none sm:block text-muted-foreground" />
        </div>
        {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
      </div>
    );
  }
);

Select.displayName = 'Select';
