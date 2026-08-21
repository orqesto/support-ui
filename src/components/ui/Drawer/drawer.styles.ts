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

// z-[70], above the mobile top bar's z-[65]. At z-50 the bar covered the drawer's own
// header — title and close button both — so on a narrow screen a Drawer had no visible
// way out. A modal surface has to sit above the page chrome it is covering.
export const drawerContentVariants = cva(
  'flex fixed inset-y-0 z-[70] flex-col shadow-xl bg-background animate-slide-in',
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
