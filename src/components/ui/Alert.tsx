import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

type AlertVariant = 'default' | 'warning' | 'danger' | 'success' | 'info';

type AlertProps = {
  variant?: AlertVariant;
  className?: string;
  children: ReactNode;
};

type AlertTitleProps = {
  className?: string;
  children: ReactNode;
};

type AlertDescriptionProps = {
  className?: string;
  children: ReactNode;
};

const variantStyles: Record<AlertVariant, string> = {
  default: 'bg-muted border-border',
  warning: 'bg-amber-50 dark:bg-amber-950 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-100',
  danger: 'bg-red-50 dark:bg-red-950 border-red-300 dark:border-red-700 text-red-900 dark:text-red-100',
  success: 'bg-green-50 dark:bg-green-950 border-green-300 dark:border-green-700 text-green-900 dark:text-green-100',
  info: 'bg-blue-50 dark:bg-blue-950 border-blue-300 dark:border-blue-700 text-blue-900 dark:text-blue-100',
};

export const Alert = ({ variant = 'default', className, children }: AlertProps) => (
  <div
    className={cn(
      'relative w-full rounded-lg border p-4',
      variantStyles[variant],
      className
    )}
    role="alert"
  >
    {children}
  </div>
);

export const AlertTitle = ({ className, children }: AlertTitleProps) => (
  <h5 className={cn('mb-1 font-medium leading-none tracking-tight', className)}>
    {children}
  </h5>
);

export const AlertDescription = ({ className, children }: AlertDescriptionProps) => (
  <div className={cn('text-sm [&_p]:leading-relaxed', className)}>
    {children}
  </div>
);
