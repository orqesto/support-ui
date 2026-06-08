import { cva, type VariantProps } from 'class-variance-authority';

// Styled to read like the native browser tooltip (slightly translucent dark
// charcoal box, light text, subtle shadow, no arrow). Positioning is handled
// by the component via a body-level portal + inline `position: fixed`, so
// the `side` variant carries no class-level effect — it exists only to keep
// the typed prop on TooltipProps for the JS positioning logic to consume.
export const tooltipVariants = cva(
  'z-[9999] text-white bg-gray-900/95 dark:bg-gray-800/95 rounded shadow-md whitespace-nowrap pointer-events-none transition-opacity duration-150',
  {
    variants: {
      side: {
        top: '',
        bottom: '',
        left: '',
        right: '',
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
