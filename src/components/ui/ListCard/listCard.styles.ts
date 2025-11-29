import { cva, type VariantProps } from 'class-variance-authority';

export const listCardVariants = cva('overflow-hidden transition-shadow', {
  variants: {
    hover: {
      true: 'hover:shadow-md',
      false: '',
    },
    spacing: {
      none: 'p-0',
      sm: 'p-2',
      md: 'p-4',
      lg: 'p-6',
    },
  },
  defaultVariants: {
    hover: true,
    spacing: 'md',
  },
});

export const listCardContentVariants = cva('min-w-0', {
  variants: {
    spacing: {
      none: 'space-y-0',
      sm: 'space-y-2',
      md: 'space-y-3',
      lg: 'space-y-4',
    },
  },
  defaultVariants: {
    spacing: 'md',
  },
});

export type ListCardVariantsType = VariantProps<typeof listCardVariants>;

export const getListCardClasses = (
  hover?: ListCardVariantsType['hover'],
  spacing?: ListCardVariantsType['spacing']
) => listCardVariants({ hover, spacing });

export const getListCardContentClasses = (spacing?: ListCardVariantsType['spacing']) =>
  listCardContentVariants({ spacing });
