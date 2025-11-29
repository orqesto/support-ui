import { cva, type VariantProps } from 'class-variance-authority';

export const tooltipVariants = cva(
  'absolute z-[9999] px-3 py-1.5 text-xs font-medium text-white bg-gray-900 dark:bg-gray-700 rounded-md shadow-xl whitespace-nowrap pointer-events-none transition-opacity duration-150',
  {
    variants: {
      side: {
        top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
        bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
        left: 'right-full top-1/2 -translate-y-1/2 mr-2',
        right: 'left-full top-1/2 -translate-y-1/2 ml-2',
      },
      size: {
        sm: 'text-[10px] px-2 py-1',
        md: 'text-xs px-3 py-1.5',
        lg: 'text-sm px-4 py-2',
      },
    },
    defaultVariants: {
      side: 'top',
      size: 'md',
    },
  }
);

export const tooltipArrowVariants = cva(
  'absolute w-0 h-0 border-4 border-gray-900 dark:border-gray-700',
  {
    variants: {
      side: {
        top: 'top-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent',
        bottom:
          'bottom-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent',
        left: 'left-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent',
        right:
          'right-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent',
      },
    },
    defaultVariants: {
      side: 'top',
    },
  }
);

export type TooltipVariantsType = VariantProps<typeof tooltipVariants>;

export const getTooltipClasses = (
  side?: TooltipVariantsType['side'],
  size?: TooltipVariantsType['size']
) => tooltipVariants({ side, size });

export const getTooltipArrowClasses = (side?: TooltipVariantsType['side']) =>
  tooltipArrowVariants({ side });
