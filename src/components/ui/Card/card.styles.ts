import { cva, type VariantProps } from 'class-variance-authority';

export const cardVariants = cva('rounded-lg border shadow-sm bg-card text-card-foreground', {
  variants: {
    variant: {
      default: '',
      elevated: 'shadow-md hover:shadow-lg transition-shadow',
      outline: 'border-2',
      ghost: 'border-0 shadow-none',
    },
    padding: {
      none: 'p-0',
      sm: 'p-4',
      md: 'p-6',
      lg: 'p-8',
    },
  },
  defaultVariants: {
    variant: 'default',
    padding: 'md',
  },
});

export const cardHeaderVariants = cva('flex flex-col space-y-1.5', {
  variants: {
    padding: {
      none: 'p-0',
      sm: 'p-4',
      md: 'p-6',
      lg: 'p-8',
    },
  },
  defaultVariants: {
    padding: 'md',
  },
});

export const cardContentVariants = cva('', {
  variants: {
    padding: {
      none: 'p-0',
      sm: 'p-4 pt-0',
      md: 'p-6 pt-0',
      lg: 'p-8 pt-0',
    },
  },
  defaultVariants: {
    padding: 'md',
  },
});

export const cardFooterVariants = cva('flex items-center', {
  variants: {
    padding: {
      none: 'p-0',
      sm: 'p-4 pt-0',
      md: 'p-6 pt-0',
      lg: 'p-8 pt-0',
    },
  },
  defaultVariants: {
    padding: 'md',
  },
});

export type CardVariantsType = VariantProps<typeof cardVariants>;

export const getCardClasses = (
  variant?: CardVariantsType['variant'],
  padding?: CardVariantsType['padding']
) => cardVariants({ variant, padding });

export const getCardHeaderClasses = (padding?: CardVariantsType['padding']) =>
  cardHeaderVariants({ padding });

export const getCardContentClasses = (padding?: CardVariantsType['padding']) =>
  cardContentVariants({ padding });

export const getCardFooterClasses = (padding?: CardVariantsType['padding']) =>
  cardFooterVariants({ padding });
