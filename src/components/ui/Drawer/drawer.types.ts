import type { VariantProps } from 'class-variance-authority';
import type { drawerContentVariants, drawerBackdropVariants } from './drawer.styles';
import type { ReactNode } from 'react';

export type DrawerProps = VariantProps<typeof drawerContentVariants> &
  VariantProps<typeof drawerBackdropVariants> & {
    open: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
    footer?: ReactNode;
  };
