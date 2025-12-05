import type { VariantProps } from 'class-variance-authority';
import type { listCardVariants } from './listCard.styles';
import type { ReactNode } from 'react';

export type ListCardProps = VariantProps<typeof listCardVariants> & {
  header?: ReactNode;
  content: ReactNode;
  footer?: ReactNode;
  metadata?: ReactNode;
  actions?: ReactNode;
  onClick?: () => void;
};
