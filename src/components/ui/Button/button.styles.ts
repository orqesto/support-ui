import { cva, type VariantProps } from 'class-variance-authority';

// `relative` is load-bearing, not cosmetic. Icon-only buttons carry an `sr-only` label,
// and Tailwind's `sr-only` is `position: absolute`. Without a positioned ancestor its
// containing block becomes the INITIAL containing block — the document — so it escapes any
// `overflow: auto` scroll container it happens to live in and gets laid out at its static
// position in DOCUMENT coordinates. A label deep inside a scrolled pane then stretches the
// page's scroll height to reach it.
//
// That is what broke the app shell: a "Delete" label in a Confluence row sat at document-y
// 1729 on a 1296px viewport, giving the document 433px of phantom scroll. Scrolling the
// document dragged the sidebar off-screen (its `lg:sticky` can't help — sticky is inert
// under the shell's `overflow:hidden` row), which read as "the sidebar scrolls" plus a
// second scrollbar and dead space. It only reproduced at viewport heights where the label
// fell below the fold, which is why it looked screen-size dependent.
export const buttonVariants = cva(
  'inline-flex relative justify-center items-center font-medium rounded-md transition-colors ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
      },
      size: {
        sm: 'h-9 px-3 text-sm',
        md: 'h-10 px-4 py-2',
        lg: 'h-11 px-8',
        icon: 'h-10 w-10 p-0',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

export type ButtonVariantsType = VariantProps<typeof buttonVariants>;

export const getButtonClasses = (
  variant?: ButtonVariantsType['variant'],
  size?: ButtonVariantsType['size']
) => buttonVariants({ variant, size });
