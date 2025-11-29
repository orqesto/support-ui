import { cva, type VariantProps } from 'class-variance-authority';

export const inputVariants = cva(
  'flex w-full rounded-md border border-border bg-input text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted file:border-0 file:bg-transparent file:text-sm file:font-medium',
  {
    variants: {
      size: {
        sm: 'h-8 px-2 py-1 text-xs',
        md: 'h-10 px-3 py-2 text-sm',
        lg: 'h-12 px-4 py-3 text-base',
      },
      variant: {
        default: '',
        error: 'border-destructive focus:ring-destructive',
        success: 'border-green-500 focus:ring-green-500',
      },
    },
    defaultVariants: {
      size: 'md',
      variant: 'default',
    },
  }
);

export const inputLabelVariants = cva('block mb-2 font-medium', {
  variants: {
    size: {
      sm: 'text-xs',
      md: 'text-sm',
      lg: 'text-base',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

export const inputErrorVariants = cva('mt-1 text-destructive', {
  variants: {
    size: {
      sm: 'text-xs',
      md: 'text-sm',
      lg: 'text-sm',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

export type InputVariantsType = VariantProps<typeof inputVariants>;

export const getInputClasses = (
  size?: InputVariantsType['size'],
  variant?: InputVariantsType['variant']
) => inputVariants({ size, variant });

export const getInputLabelClasses = (size?: InputVariantsType['size']) =>
  inputLabelVariants({ size });

export const getInputErrorClasses = (size?: InputVariantsType['size']) =>
  inputErrorVariants({ size });
