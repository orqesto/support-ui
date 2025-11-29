import { cva, type VariantProps } from 'class-variance-authority';

export const drawerBackdropVariants = cva('fixed inset-0 transition-opacity cursor-pointer', {
  variants: {
    blur: {
      none: 'bg-black/50',
      sm: 'bg-black/50 backdrop-blur-sm',
      md: 'bg-black/60 backdrop-blur-md',
    },
  },
  defaultVariants: {
    blur: 'none',
  },
});

export const drawerContentVariants = cva(
  'flex fixed inset-y-0 z-50 flex-col shadow-xl bg-background animate-slide-in',
  {
    variants: {
      side: {
        right: 'right-0',
        left: 'left-0',
      },
      size: {
        sm: 'max-w-sm w-full',
        md: 'max-w-md w-full',
        lg: 'max-w-2xl w-full',
        xl: 'max-w-4xl w-full',
        full: 'max-w-full w-full',
      },
    },
    defaultVariants: {
      side: 'right',
      size: 'lg',
    },
  }
);

export type DrawerVariantsType = VariantProps<typeof drawerContentVariants>;

export const getDrawerBackdropClasses = (
  blur?: VariantProps<typeof drawerBackdropVariants>['blur']
) => drawerBackdropVariants({ blur });

export const getDrawerContentClasses = (
  side?: DrawerVariantsType['side'],
  size?: DrawerVariantsType['size']
) => drawerContentVariants({ side, size });
