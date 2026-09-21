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
  warning: 'bg-warning-muted border-warning-line text-warning',
  danger: 'bg-destructive-muted border-destructive-line text-destructive',
  success: 'bg-success-muted border-success-line text-success',
  info: 'bg-primary-muted border-primary-line text-primary',
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
