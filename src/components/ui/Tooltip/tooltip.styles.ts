import { cva, type VariantProps } from 'class-variance-authority';

// Styled to read like the native browser tooltip (slightly translucent dark
// charcoal box, light text, subtle shadow, no arrow) — that's the look users
// prefer for compact metadata hints. Custom JSX-rich tooltips still work via
// the `content` prop; the box shape is identical regardless of payload.
export const tooltipVariants = cva(
  'absolute z-[9999] text-white bg-gray-900/95 dark:bg-gray-800/95 rounded shadow-md whitespace-nowrap pointer-events-none transition-opacity duration-150',
  {
    variants: {
      side: {
        top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
        bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
        left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
        right: 'left-full top-1/2 -translate-y-1/2 ml-1.5',
      },
      size: {
        sm: 'text-[11px] px-2 py-1',
        md: 'text-xs px-2.5 py-1',
        lg: 'text-sm px-3 py-1.5',
      },
    },
    defaultVariants: {
      side: 'top',
      size: 'md',
    },
  }
);

export type TooltipVariantsType = VariantProps<typeof tooltipVariants>;

export const getTooltipClasses = (
  side?: TooltipVariantsType['side'],
  size?: TooltipVariantsType['size']
) => tooltipVariants({ side, size });
