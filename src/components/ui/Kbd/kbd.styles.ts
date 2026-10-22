import { cva, type VariantProps } from 'class-variance-authority';

export const kbdVariants = cva(
  'inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded border font-mono text-[10.5px] leading-none',
  {
    variants: {
      /** `tooltip`: light on the dark tooltip box. `surface`: on the page's own background. */
      tone: {
        surface: 'border-border bg-muted text-muted-foreground',
        tooltip: 'border-background/30 bg-background/15 text-background',
      },
    },
    defaultVariants: { tone: 'surface' },
  }
);

export type KbdVariantsType = VariantProps<typeof kbdVariants>;
