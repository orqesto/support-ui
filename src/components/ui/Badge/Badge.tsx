import { cn } from '@/lib/utils';
import { getBadgeClasses } from './badge.styles';
import type { BadgeProps } from './badge.types';

export const Badge = ({ className, variant, size, ...props }: BadgeProps) => (
  <div className={cn(getBadgeClasses(variant, size), className)} {...props} />
);
