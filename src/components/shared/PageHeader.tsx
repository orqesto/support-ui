import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type PageHeaderProps = {
  /** A string, or a node when one screen needs a different size (Messages passes `text-xl`). */
  title: ReactNode;
  description?: string;
  actions?: ReactNode;
  /**
   * Controls that belong to the title rather than to the actions — Messages puts its view
   * switch and surface count here (Messages list v2), on the title's line.
   */
  meta?: ReactNode;
  className?: string;
};

export const PageHeader = ({ title, description, actions, meta, className }: PageHeaderProps) => (
  <div
    className={cn('flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3', className)}
  >
    <div className="min-w-0">
      {meta ? (
        <div className="flex flex-wrap gap-x-3 gap-y-2 items-center min-w-0">
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            {title}
          </h1>
          {meta}
        </div>
      ) : (
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">{title}</h1>
      )}
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
    </div>
    {actions && <div className="flex flex-shrink-0 gap-2 items-center">{actions}</div>}
  </div>
);
