import { cva, type VariantProps } from 'class-variance-authority';

export const externalLinkVariants = cva(
  'inline-flex gap-1 items-center hover:underline transition-colors',
  {
    variants: {
      variant: {
        default: 'text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300',
        primary: 'text-primary hover:text-primary/80',
        muted: 'text-muted-foreground hover:text-foreground',
        destructive: 'text-destructive hover:text-destructive/80',
      },
      size: {
        sm: 'text-xs',
        md: 'text-sm',
        lg: 'text-base',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
);

export const externalLinkIconVariants = cva('', {
  variants: {
    size: {
      sm: 'w-3 h-3',
      md: 'w-4 h-4',
      lg: 'w-5 h-5',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

export type ExternalLinkVariantsType = VariantProps<typeof externalLinkVariants>;

export const getExternalLinkClasses = (
  variant?: ExternalLinkVariantsType['variant'],
  size?: ExternalLinkVariantsType['size']
) => externalLinkVariants({ variant, size });

export const getExternalLinkIconClasses = (size?: ExternalLinkVariantsType['size']) =>
  externalLinkIconVariants({ size });
