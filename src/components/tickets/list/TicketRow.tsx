import { Lock } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { formatAge } from '@/lib/utils';
import { AssigneeCell } from './AssigneeCell';
import { RowMenu } from './RowMenu';
import { LabelChip, OwedCell, PriorityIcon, StatusDot, ThreadCount } from './ticketRowBits';
import { HIDE_BELOW_MD, TICKET_GRID, type TicketRowProps } from './ticketRowShared';

/** One ticket as a table row — scan by column. */
export const TicketRow = ({
  ticket,
  canManage,
  assignees,
  currentUserId,
  current,
  onOpen,
  onAssign,
  onRowMenu,
}: TicketRowProps) => {
  const firstLabel = ticket.labels?.[0];
  return (
    <div
      role="row"
      tabIndex={0}
      aria-current={current || undefined}
      data-ticket-row={ticket.id}
      onClick={() => onOpen(ticket)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && event.target === event.currentTarget) onOpen(ticket);
      }}
      className={`${TICKET_GRID} group/row relative min-h-[46px] border-t border-border/60 first:border-t-0 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
        current ? 'bg-primary/10 shadow-[inset_3px_0_0_hsl(var(--primary))]' : 'hover:bg-muted/50'
      }`}
    >
      <span className="flex items-center">
        <PriorityIcon priority={ticket.priority} />
      </span>
      <span className="flex gap-2 items-center min-w-0">
        <span className="font-mono text-[11.5px] text-muted-foreground shrink-0">#{ticket.id}</span>
        <span className="font-semibold truncate text-[13.5px]">{ticket.title}</span>
        {firstLabel && (
          <span className="hidden lg:inline-flex">
            <LabelChip name={firstLabel.name} color={firstLabel.color} />
          </span>
        )}
        {ticket.externalId && (
          <Tooltip
            content="Synced to Jira — edit it there"
            size="sm"
            className="hidden xl:inline-flex"
          >
            <span className="inline-flex gap-1 items-center font-mono text-[11px] text-muted-foreground shrink-0">
              <Lock className="w-3 h-3" />
              {ticket.externalId}
            </span>
          </Tooltip>
        )}
      </span>
      <span className="flex items-center">
        <ThreadCount count={ticket.threadCount} />
      </span>
      <span className="flex items-center">
        <OwedCell count={ticket.owedCount} />
      </span>
      <span className={HIDE_BELOW_MD}>
        <StatusDot status={ticket.status} />
      </span>
      <span className={`${HIDE_BELOW_MD} min-w-0`}>
        <AssigneeCell
          ticket={ticket}
          canManage={canManage}
          assignees={assignees}
          currentUserId={currentUserId}
          onAssign={onAssign}
        />
      </span>
      <span
        className={`${HIDE_BELOW_MD} justify-end font-mono text-[11.5px] text-muted-foreground whitespace-nowrap`}
      >
        <Tooltip content={`Updated ${new Date(ticket.updatedAt).toLocaleString()}`} size="sm">
          {formatAge(ticket.updatedAt)}
        </Tooltip>
      </span>
      <span className="flex justify-end items-center">
        <RowMenu ticket={ticket} onRowMenu={onRowMenu} />
      </span>
    </div>
  );
};
