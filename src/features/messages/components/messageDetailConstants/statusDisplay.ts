import type { ThreadStatus, TicketPriority } from '@/types';
import { priorityLabel } from './labels';

// ─── Status display ───────────────────────────────────────────────────────────

// NOTE: this map is the MANUAL status-action control (the detail-header dropdown),
// not the display badge — the badge is owned by getStatusBadge (canonical). Under
// the derived model the only coherent manual actions are: Open (un-hold), On-hold
// (park — the 'pending' enum value stamps parked_at), Resolved, Closed. Open/In
// Progress/Pending-as-flow are DERIVED from lastReplyFromClient and not settable.
export const STATUS_DISPLAY: Record<ThreadStatus, { label: string; dot: string; chip: string }> = {
  open: {
    label: 'OPEN',
    dot: 'bg-foreground',
    chip: 'text-foreground border-border-strong bg-raised',
  },
  in_progress: {
    label: 'IN PROGRESS',
    dot: 'bg-muted-foreground',
    chip: 'text-muted-foreground border-border bg-muted',
  },
  pending: {
    // The 'pending' enum value = the On-hold (park) action.
    label: 'ON-HOLD',
    dot: 'bg-warning',
    chip: 'text-warning  border-warning-line  bg-warning-muted   ',
  },
  resolved: {
    label: 'RESOLVED',
    dot: 'bg-success',
    chip: 'text-success border-success-line bg-success-muted',
  },
  closed: {
    label: 'CLOSED',
    dot: 'bg-muted-foreground/50',
    chip: 'text-muted-foreground border-border bg-muted',
  },
  filtered: {
    label: 'FILTERED',
    dot: 'bg-muted-foreground/30',
    chip: 'text-muted-foreground/60 border-border/50 bg-muted/50',
  },
  needs_routing: {
    label: 'NEEDS ROUTING',
    dot: 'bg-muted-foreground',
    chip: 'text-muted-foreground border-border bg-muted',
  },
};

// 'in_progress' removed — it's derived (customer reply), not manually settable
// (the BE rejects it too). 'pending' = the On-hold (park) action.
export const SETTABLE_STATUSES: ThreadStatus[] = ['open', 'pending', 'closed'];

export const STATUS_MENU_LABELS: Record<ThreadStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  pending: 'On-hold',
  resolved: 'Resolved',
  closed: 'Closed',
  filtered: 'Filtered',
  needs_routing: 'Needs Routing',
};

export const STATUS_OPTIONS = SETTABLE_STATUSES.map((stat) => ({
  value: stat,
  label: STATUS_DISPLAY[stat].label,
  menuLabel: STATUS_MENU_LABELS[stat],
  chipClassName: STATUS_DISPLAY[stat].chip,
  dotClassName: STATUS_DISPLAY[stat].dot,
}));

export const PRIORITY_OPTIONS: {
  value: TicketPriority;
  chipClassName: string;
  dotClassName: string;
}[] = [
  {
    value: 'low',
    dotClassName: 'bg-success',
    chipClassName: 'text-success  bg-success-muted   border-success-line   ',
  },
  {
    value: 'medium',
    dotClassName: 'bg-warning',
    chipClassName: 'text-warning bg-warning-muted border-warning-line',
  },
  {
    value: 'high',
    dotClassName: 'bg-warning',
    chipClassName: 'text-warning bg-warning-muted  border-warning-line',
  },
  {
    value: 'critical',
    dotClassName: 'bg-destructive',
    chipClassName: 'text-destructive    bg-destructive-muted     border-destructive-line         ',
  },
];

/** PRIORITY_OPTIONS for the v4 header chip and its menu: "High", not "HIGH" (`priorityLabel`). */
export const HEADER_PRIORITY_OPTIONS = PRIORITY_OPTIONS.map((option) => ({
  ...option,
  label: priorityLabel(option.value),
  menuLabel: priorityLabel(option.value),
}));

export const CHANNEL_ICONS: Record<string, string> = {
  email: '✉',
  telegram: '✈',
  slack: '◆',
  chat: '◉',
  whatsapp: '✆',
  other: '◌',
};
