import { cva, type VariantProps } from 'class-variance-authority';

export const paginationContainerVariants = cva(
  'flex flex-col gap-2 justify-between items-center px-4 py-3 rounded-b-lg border-t border-border bg-card',
  {
    variants: {
      size: {
        sm: 'px-2 py-2',
        md: 'px-4 py-3',
        lg: 'px-6 py-4',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
);

export const paginationPageButtonVariants = cva(
  'min-w-[36px] h-9 px-3 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
  {
    variants: {
      isActive: {
        true: 'bg-primary text-primary-foreground',
        false: 'hover:bg-accent text-foreground',
      },
    },
    defaultVariants: {
      isActive: false,
    },
  }
);

export type PaginationVariantsType = VariantProps<typeof paginationContainerVariants>;

export const getPaginationContainerClasses = (size?: PaginationVariantsType['size']) =>
  paginationContainerVariants({ size });

export const getPaginationPageButtonClasses = (isActive?: boolean) =>
  paginationPageButtonVariants({ isActive });
