import type { VariantProps } from 'class-variance-authority';
import type { typographyVariants } from './typography.styles';

export type TypographyProps = Omit<React.HTMLAttributes<HTMLElement>, 'color'> &
  VariantProps<typeof typographyVariants> & {
    children: React.ReactNode;
  };
