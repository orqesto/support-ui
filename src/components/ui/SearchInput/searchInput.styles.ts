import { cva, type VariantProps } from 'class-variance-authority';

export const searchInputVariants = cva(
  'w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground',
  {
    variants: {
      size: {
        sm: 'px-3 py-2 pr-8 text-xs h-8',
        md: 'px-3 py-2 pr-9 text-sm h-10',
        lg: 'px-4 py-3 pr-10 text-base h-12',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
);

export const searchIconVariants = cva('', {
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

export const searchButtonVariants = cva(
  'h-auto p-2 rounded-full transition-colors hover:bg-primary/10',
  {
    variants: {
      size: {
        sm: 'min-h-[36px] min-w-[36px]',
        md: 'min-h-[44px] min-w-[44px]',
        lg: 'min-h-[48px] min-w-[48px]',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
);

export type SearchInputVariantsType = VariantProps<typeof searchInputVariants>;

export const getSearchInputClasses = (size?: SearchInputVariantsType['size']) =>
  searchInputVariants({ size });

export const getSearchIconClasses = (size?: SearchInputVariantsType['size']) =>
  searchIconVariants({ size });

export const getSearchButtonClasses = (size?: SearchInputVariantsType['size']) =>
  searchButtonVariants({ size });
