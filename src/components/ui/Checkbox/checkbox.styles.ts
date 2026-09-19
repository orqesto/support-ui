import { cva } from 'class-variance-authority';

/**
 * A TICK BOX, not a switch. `Toggle` is for a setting that takes effect when you flip it; this is
 * for a statement you make as part of submitting a form — a consent, an acknowledgement, a "yes,
 * also do this". Rendering one as the other misleads: a Toggle implies the change already happened.
 */
export const checkboxVariants = cva(
  'shrink-0 rounded border-border bg-input text-primary accent-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      size: {
        sm: 'h-3.5 w-3.5',
        md: 'h-4 w-4',
        lg: 'h-5 w-5',
      },
      variant: {
        default: '',
        error: 'border-destructive focus:ring-destructive',
      },
    },
    defaultVariants: { size: 'md', variant: 'default' },
  }
);
