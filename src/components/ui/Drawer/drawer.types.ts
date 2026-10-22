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
    /** Replaces the title bar (the title stays as the panel's accessible name). */
    header?: ReactNode;
    /** Classes for the scrolling body; defaults to padded. */
    bodyClassName?: string;
  };
