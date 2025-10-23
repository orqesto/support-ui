import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'secondary';

type BadgeProps = HTMLAttributes<HTMLDivElement> & {
  variant?: BadgeVariant;
};

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-primary text-primary-foreground',
  success: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  danger: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  secondary: 'bg-secondary text-secondary-foreground',
};

export const Badge = ({ className, variant = 'default', ...props }: BadgeProps) => (
  <div
    className={cn(
      'inline-flex items-center rounded-full px-2.5 text-xs font-semibold transition-colors',
      'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
      variantStyles[variant],
      className
    )}
    {...props}
  />
);
