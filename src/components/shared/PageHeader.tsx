import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type PageHeaderProps = {
  /** A string, or a node when one screen needs a different size (Messages passes `text-xl`). */
  title: ReactNode;
  description?: string;
  actions?: ReactNode;
  className?: string;
};

export const PageHeader = ({ title, description, actions, className }: PageHeaderProps) => (
  <div
    className={cn('flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3', className)}
  >
    <div className="min-w-0">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
    </div>
    {actions && <div className="flex flex-shrink-0 gap-2 items-center">{actions}</div>}
  </div>
);
