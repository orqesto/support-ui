import { cn } from '@/lib/utils';
import type { ComponentType } from 'react';

export type Segment<T extends string> = {
  value: T;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  /** Tooltip — say what the view shows, not what the button does. */
  title?: string;
};

/**
 * A row of mutually exclusive choices as one compact track: the active segment is lifted
 * (card background, ring, semibold), the rest are quiet text. 30px tall, so it sits on a
 * 28px pill row without growing it (Kanban space audit, 2026-09-07).
 *
 * Both view switches use it — Messages (Threads / Contacts / Kanban) and Tickets
 * (List / Kanban) — so the two inboxes cannot drift into two looks for the same control.
 * `Tabs` is the other primitive for "which of these": it draws an underlined tab strip
 * that owns its own row, which is the height this exists to avoid.
 */
export const SegmentedControl = <T extends string>({
  value,
  onChange,
  segments,
  ariaLabel,
  size = 'sm',
  iconOnly = false,
  className,
}: {
  value: T;
  onChange: (next: T) => void;
  segments: Segment<T>[];
  ariaLabel: string;
  /**
   * `sm` (default) is the 30px track above. `md` is the page-header switch of Messages list v2:
   * a 34px sunken track with 28px segments, the size of the header buttons beside it.
   */
  size?: 'sm' | 'md';
  /**
   * Draw only the icons — for settings toggles (row density, layout) whose meaning is the
   * picture. The label still names the segment for assistive tech and the tooltip.
   */
  iconOnly?: boolean;
  className?: string;
}) => (
  <div
    role="group"
    aria-label={ariaLabel}
    className={cn(
      'flex gap-0.5 p-0.5 border',
      size === 'md'
        ? 'rounded-[9px] bg-sunken border-border'
        : 'rounded-md bg-background border-border/70',
      className
    )}
  >
    {segments.map((segment) => {
      const active = segment.value === value;
      const Icon = segment.icon;
      return (
        <button
          key={segment.value}
          type="button"
          aria-pressed={active}
          aria-label={iconOnly ? segment.label : undefined}
          title={segment.title ?? (iconOnly ? segment.label : undefined)}
          onClick={() => onChange(segment.value)}
          className={cn(
            'inline-flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            iconOnly
              ? 'w-7 h-6 rounded-md'
              : size === 'md'
                ? 'gap-1.5 h-7 px-[11px] rounded-[7px] text-[13px]'
                : 'font-display gap-1.5 h-6 px-2.5 rounded-[5px] text-[12px]',
            active
              ? 'bg-card text-foreground font-semibold shadow-sm ring-1 ring-border'
              : 'text-muted-foreground font-medium hover:text-foreground'
          )}
        >
          {Icon && <Icon className={size === 'md' || iconOnly ? 'w-3.5 h-3.5' : 'w-3 h-3'} />}
          {!iconOnly && <span className="min-w-0 truncate">{segment.label}</span>}
        </button>
      );
    })}
  </div>
);
