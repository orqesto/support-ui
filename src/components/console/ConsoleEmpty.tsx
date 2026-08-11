import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Shared empty-state for Console and Platform console list pages. Consolidates the four
 * ad-hoc markups that existed before (bare `<p>`, Card+`<p>`, Card+icon+`<p>`,
 * flex-fill `<p>`) into one. Defaults to a flex-fill centered block so it sits
 * correctly inside a fill-height Card body; pass `className` to override.
 */
type ConsoleEmptyProps = {
  message: string;
  /** Optional lucide icon shown above the message. */
  icon?: LucideIcon;
  className?: string;
};

export const ConsoleEmpty = ({ message, icon: Icon, className }: ConsoleEmptyProps) => (
  <div
    className={cn(
      'flex flex-col flex-1 gap-2 justify-center items-center py-8 min-h-0 text-center',
      className,
    )}
  >
    {Icon && <Icon className="w-8 h-8 text-muted-foreground/50" />}
    <p className="text-sm text-muted-foreground">{message}</p>
  </div>
);
