import { cn } from '@/lib/utils';
import { typographyVariants } from './typography.styles';
import { type TypographyProps } from './typography.types';

export const Typography = ({
  variant,
  color,
  weight,
  truncate,
  align,
  className,
  children,
  ...props
}: TypographyProps) => (
  <span
    className={cn(typographyVariants({ variant, color, weight, truncate, align }), className)}
    {...props}
  >
    {children}
  </span>
);
