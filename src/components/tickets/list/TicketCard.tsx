import { Lock } from 'lucide-react';
import { formatAge } from '@/lib/utils';
import { AssigneeCell } from './AssigneeCell';
import { RowMenu } from './RowMenu';
import {
  LabelChip,
  OwedCell,
  PriorityIcon,
  SPINE_CLASS,
  StatusDot,
  ThreadCount,
  plainText,
  spineTone,
} from './ticketRowBits';
import type { TicketRowProps } from './ticketRowShared';

/**
 * One ticket as a card — the Messages card: a coloured spine, the title line with its age, a
 * one-line preview, and a hairline meta row.
 */
export const TicketCard = ({
  ticket,
  canManage,
  assignees,
  currentUserId,
  current,
  onOpen,
  onAssign,
  onRowMenu,
}: TicketRowProps) => (
  <div
    role="row"
    tabIndex={0}
    aria-current={current || undefined}
    data-ticket-row={ticket.id}
    onClick={() => onOpen(ticket)}
    onKeyDown={(event) => {
      if (event.key === 'Enter' && event.target === event.currentTarget) onOpen(ticket);
    }}
    className={`group/row relative grid gap-1 py-2.5 pr-3.5 pl-4 overflow-hidden rounded-lg border cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary ${
      current ? 'bg-primary/10 border-primary/40' : 'bg-card border-border hover:shadow-md'
    }`}
  >
    <span className={`absolute inset-y-0 left-0 w-[3px] ${SPINE_CLASS[spineTone(ticket)]}`} />
    <div className="flex gap-2 items-center min-w-0">
      <PriorityIcon priority={ticket.priority} />
      <span className="font-mono text-[11.5px] text-muted-foreground shrink-0">#{ticket.id}</span>
      <span className="flex-1 min-w-0 text-sm font-semibold truncate">{ticket.title}</span>
      <span className="font-mono text-[11.5px] text-muted-foreground whitespace-nowrap">{formatAge(ticket.updatedAt)}</span>
    </div>
    <div className="text-[13px] text-muted-foreground truncate">{plainText(ticket.description)}</div>
    <div className="flex flex-wrap gap-x-2 gap-y-1 items-center pt-1.5 mt-0.5 text-xs border-t border-border/60 text-muted-foreground">
      <StatusDot status={ticket.status} />
      {ticket.categoryName && <span className="max-w-[140px] truncate">{ticket.categoryName}</span>}
      {ticket.labels?.map((label) => <LabelChip key={label.id} name={label.name} color={label.color} />)}
      <ThreadCount count={ticket.threadCount} />
      {(ticket.owedCount ?? 0) > 0 && <OwedCell count={ticket.owedCount} />}
      {ticket.externalId && (
        <span className="inline-flex gap-1 items-center font-mono text-[11px]">
          <Lock className="w-3 h-3" />
          {ticket.externalId}
        </span>
      )}
      <span className="flex-1" />
      <AssigneeCell
        ticket={ticket}
        canManage={canManage}
        assignees={assignees}
        currentUserId={currentUserId}
        onAssign={onAssign}
      />
      <RowMenu ticket={ticket} onRowMenu={onRowMenu} />
    </div>
  </div>
);
