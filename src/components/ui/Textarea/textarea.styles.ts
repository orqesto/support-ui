import { cva, type VariantProps } from 'class-variance-authority';

export const textareaVariants = cva(
  'flex w-full rounded-md border border-border bg-input text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted resize-y',
  {
    variants: {
      size: {
        sm: 'min-h-[80px] px-2 py-1 text-xs',
        md: 'min-h-[120px] px-3 py-2 text-sm',
        lg: 'min-h-[160px] px-4 py-3 text-base',
      },
      variant: {
        default: '',
        error: 'border-destructive focus:ring-destructive',
        success: 'border-green-500 focus:ring-green-500',
      },
      resize: {
        none: 'resize-none',
        vertical: 'resize-y',
        horizontal: 'resize-x',
        both: 'resize',
      },
    },
    defaultVariants: {
      size: 'md',
      variant: 'default',
      resize: 'vertical',
    },
  }
);

export const textareaLabelVariants = cva('block mb-2 font-medium', {
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

export const textareaErrorVariants = cva('mt-1 text-destructive', {
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

export type TextareaVariantsType = VariantProps<typeof textareaVariants>;

export const getTextareaClasses = (
  size?: TextareaVariantsType['size'],
  variant?: TextareaVariantsType['variant'],
  resize?: TextareaVariantsType['resize']
) => textareaVariants({ size, variant, resize });

export const getTextareaLabelClasses = (size?: TextareaVariantsType['size']) =>
  textareaLabelVariants({ size });

export const getTextareaErrorClasses = (size?: TextareaVariantsType['size']) =>
  textareaErrorVariants({ size });
