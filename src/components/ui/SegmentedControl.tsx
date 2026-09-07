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
}: {
  value: T;
  onChange: (next: T) => void;
  segments: Segment<T>[];
  ariaLabel: string;
}) => (
  <div
    role="group"
    aria-label={ariaLabel}
    className="flex gap-0.5 p-0.5 rounded-md bg-background border border-border/70"
  >
    {segments.map((segment) => {
      const active = segment.value === value;
      const Icon = segment.icon;
      return (
        <button
          key={segment.value}
          type="button"
          aria-pressed={active}
          title={segment.title}
          onClick={() => onChange(segment.value)}
          className={`inline-flex items-center gap-1.5 h-6 px-2.5 rounded-[5px] text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            active
              ? 'bg-card text-foreground font-semibold shadow-sm ring-1 ring-border'
              : 'text-muted-foreground font-medium hover:text-foreground'
          }`}
        >
          {Icon && <Icon className="w-3 h-3" />}
          {segment.label}
        </button>
      );
    })}
  </div>
);
