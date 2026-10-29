import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { formatCount, type Count } from '@/lib/listTotals';
import { cn } from '@/lib/utils';

type ViewPillProps = {
  /** Lit: the list is showing this view. */
  on: boolean;
  /** Rows in the view (`10,000+` when counted to a cap); nothing while unknown (never a guessed 0). */
  count?: Count;
  onClick: () => void;
  children: ReactNode;
  /** After the count: a "2 new" badge, a menu chevron. */
  after?: ReactNode;
  title?: string;
  'aria-haspopup'?: 'menu';
  'aria-expanded'?: boolean;
  className?: string;
};

/**
 * A view as a round pill with its count — ONE component for the Tickets and Threads lists, so the
 * two read as one design (Claude Design "Tickets v3" / "Messages list v4", `.vp`).
 */
export const ViewPill = ({
  on,
  count,
  onClick,
  children,
  after,
  title,
  className,
  ...aria
}: ViewPillProps) => (
  <Button
    variant="ghost"
    aria-pressed={on}
    onClick={onClick}
    title={title}
    {...aria}
    className={cn(
      'h-[30px] px-3 gap-2 rounded-full border text-[12.5px] shrink-0',
      on
        ? 'bg-primary border-primary text-primary-foreground font-semibold hover:bg-primary hover:text-primary-foreground'
        : 'bg-card border-border text-muted-foreground font-medium hover:text-foreground hover:border-border-strong',
      className
    )}
  >
    {children}
    {count !== undefined && (
      <span className="font-mono text-[11px] opacity-75">{formatCount(count)}</span>
    )}
    {after}
  </Button>
);
