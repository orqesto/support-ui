import { cn } from '@/lib/utils';
import {
  getCardClasses,
  getCardHeaderClasses,
  getCardContentClasses,
  getCardFooterClasses,
} from './card.styles';
import type {
  CardProps,
  CardHeaderProps,
  CardTitleProps,
  CardDescriptionProps,
  CardContentProps,
  CardFooterProps,
} from './card.types';

export const Card = ({ className, variant, padding, ...props }: CardProps) => (
  <div className={cn(getCardClasses(variant, padding), className)} {...props} />
);

export const CardHeader = ({ className, padding, ...props }: CardHeaderProps) => (
  <div className={cn(getCardHeaderClasses(padding), className)} {...props} />
);

export const CardTitle = ({ className, children, ...props }: CardTitleProps) => (
  <h3 className={cn('text-2xl font-semibold tracking-tight leading-none', className)} {...props}>
    {children}
  </h3>
);

export const CardDescription = ({ className, ...props }: CardDescriptionProps) => (
  <p className={cn('text-sm text-muted-foreground', className)} {...props} />
);

export const CardContent = ({ className, padding, ...props }: CardContentProps) => (
  <div className={cn(getCardContentClasses(padding), className)} {...props} />
);

export const CardFooter = ({ className, padding, ...props }: CardFooterProps) => (
  <div className={cn(getCardFooterClasses(padding), className)} {...props} />
);
