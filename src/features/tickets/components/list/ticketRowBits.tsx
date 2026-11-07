import { MessagesSquare } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Tooltip } from '@/components/ui/Tooltip';
import type { Ticket, TicketPriority, TicketStatus } from '@/types';
import { PRIORITY_LABELS, STATUS_LABELS } from './ticketFilterKeys';

const isDone = (status: TicketStatus) => status === 'resolved' || status === 'closed';

export type SpineTone = 'danger' | 'att' | 'ok' | 'blue' | 'calm';

/** The card's left spine: what most needs attention wins. */
export const spineTone = (ticket: Ticket): SpineTone => {
  if (ticket.priority === 'critical' && !isDone(ticket.status)) return 'danger';
  if ((ticket.owedCount ?? 0) > 0) return 'att';
  if (ticket.status === 'resolved') return 'ok';
  if (ticket.status === 'open' || ticket.status === 'in_progress') return 'blue';
  return 'calm';
};

export const SPINE_CLASS: Record<SpineTone, string> = {
  danger: 'bg-destructive',
  att: 'bg-attention',
  ok: 'bg-success',
  blue: 'bg-primary',
  calm: 'bg-muted-foreground/50',
};

export const STATUS_DOT: Record<TicketStatus, string> = {
  pending: 'bg-pending',
  open: 'bg-primary',
  in_progress: 'bg-caution-solid',
  resolved: 'bg-success',
  closed: 'bg-muted-foreground/60',
};

export const StatusDot = ({ status }: { status: TicketStatus }) => (
  <span className="inline-flex gap-1.5 items-center text-[12.5px] font-medium whitespace-nowrap">
    <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[status]}`} />
    {STATUS_LABELS[status]}
  </span>
);

const BARS: Record<Exclude<TicketPriority, 'critical'>, number> = { high: 3, medium: 2, low: 1 };

/** Signal bars, or a filled alert square for critical. */
export const PriorityIcon = ({ priority }: { priority: TicketPriority }) => (
  <Tooltip content={PRIORITY_LABELS[priority]} size="sm">
    <PriorityGlyph priority={priority} />
  </Tooltip>
);

const PriorityGlyph = ({ priority }: { priority: TicketPriority }) => {
  const label = PRIORITY_LABELS[priority];
  if (priority === 'critical') {
    return (
      <svg
        viewBox="0 0 16 16"
        className="w-3.5 h-3.5 text-destructive"
        role="img"
        aria-label={label}
      >
        <rect x="1" y="1" width="14" height="14" rx="3.5" fill="currentColor" />
        <path d="M8 4.5v4.2M8 11.2v.1" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  const lit = BARS[priority];
  return (
    <svg
      viewBox="0 0 16 16"
      className={`w-3.5 h-3.5 ${priority === 'high' ? 'text-destructive' : 'text-muted-foreground'}`}
      role="img"
      aria-label={label}
    >
      {[0, 1, 2].map((bar) => (
        <rect
          key={bar}
          x={2 + bar * 4.5}
          y={11 - bar * 3.5}
          width="3"
          height={3 + bar * 3.5}
          rx="1"
          fill="currentColor"
          opacity={bar < lit ? 1 : 0.25}
        />
      ))}
    </svg>
  );
};

/** "N owed" when customers are still owed the fix; a dash otherwise or when unknown. */
export const OwedCell = ({ count }: { count: number | undefined }) =>
  count ? (
    <Tooltip
      content={`${count} ${count === 1 ? 'customer hasn’t' : 'customers haven’t'} been told it’s fixed`}
      size="sm"
    >
      <Badge
        size="sm"
        variant="attention"
        className="font-semibold whitespace-nowrap cursor-default"
      >
        {count} owed
      </Badge>
    </Tooltip>
  ) : (
    <span className="text-muted-foreground/70">—</span>
  );

export const ThreadCount = ({ count }: { count: number | undefined }) =>
  count === undefined ? (
    <span className="text-muted-foreground/70">—</span>
  ) : (
    <Tooltip content={`${count} ${count === 1 ? 'thread' : 'threads'}`} size="sm">
      <span className="inline-flex gap-1 items-center font-mono text-xs text-muted-foreground">
        <MessagesSquare className="w-3.5 h-3.5" />
        {count}
      </span>
    </Tooltip>
  );

export const LabelChip = ({ name, color }: { name: string; color: string }) => (
  <Badge
    size="sm"
    variant="secondary"
    className="gap-1.5 font-medium whitespace-nowrap cursor-default"
  >
    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
    {name}
  </Badge>
);

/** Description HTML as one line of text for the card preview. */
export const plainText = (html: string): string =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const initials = (name: string): string =>
  name
    .split(' ')
    .filter(Boolean)
    .map((word) => word[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

/** A stable avatar colour per user id. */
const AVATAR_COLOURS = ['#2A6FB4', '#09674B', '#7E2FB0', '#A35200', '#0E7490', '#B6206B'];
export const avatarColour = (id: number): string => AVATAR_COLOURS[id % AVATAR_COLOURS.length];

export const Avatar = ({ id, name }: { id: number; name: string }) => (
  <span
    className="grid place-items-center w-[22px] h-[22px] rounded-full text-[9.5px] font-bold text-white shrink-0"
    style={{ backgroundColor: avatarColour(id) }}
    aria-hidden="true"
  >
    {initials(name)}
  </span>
);
