import { Plus, UserMinus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { Menu, MenuItem, MenuLabel, MenuNote, MenuSeparator } from '@/components/ui/Menu';
import type { Ticket } from '@/types';
import { Avatar } from './ticketRowBits';
import { TicketRef, useTicketDisplayId } from '@/components/tickets/TicketRef';

export type AssigneeCellProps = {
  ticket: Ticket;
  canManage: boolean;
  assignees: Array<{ id: number; name: string }>;
  currentUserId: number | null;
  onAssign: (ticketId: number, userId: number | null) => void;
  /** Avatar only — the narrow layouts. */
  compact?: boolean;
  /** With `compact`: still say "Claim" / "Assign" (kanban cards) — only the owner's name goes. */
  keepActionLabel?: boolean;
};

/**
 * Who owns the ticket, and the one-click way to change it: Claim on an unassigned ticket, the
 * avatar to re-assign. Clicks never reach the row (they would open the ticket).
 */
export const AssigneeCell = ({
  ticket,
  canManage,
  assignees,
  currentUserId,
  onAssign,
  compact,
  keepActionLabel = false,
}: AssigneeCellProps) => {
  const shownId = useTicketDisplayId(ticket);
  const name =
    ticket.assigneeName ?? assignees.find((user) => user.id === ticket.assigneeId)?.name ?? '';
  const mine = ticket.assigneeId !== null && ticket.assigneeId === currentUserId;
  const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();

  if (!canManage) {
    return ticket.assigneeId === null ? (
      <span className="inline-flex gap-1.5 items-center text-[12.5px] text-muted-foreground">
        <span className="w-[22px] h-[22px] rounded-full border-[1.5px] border-dashed border-muted-foreground/60" />
        {!compact && 'Unassigned'}
      </span>
    ) : (
      <span className="inline-flex gap-1.5 items-center min-w-0 text-[12.5px]">
        <Avatar id={ticket.assigneeId} name={name} />
        {!compact && <span className="truncate">{name}</span>}
      </span>
    );
  }

  // Only someone the workspace can assign tickets to may claim one. A global admin looking at a
  // workspace they are not a member of has every permission but cannot own its tickets — the
  // server refuses — so they get the Assign menu instead.
  const canClaim = currentUserId !== null && assignees.some((user) => user.id === currentUserId);

  if (ticket.assigneeId === null && !canClaim) {
    return (
      <span onClick={stop} onKeyDown={stop} role="presentation" className="inline-flex min-w-0">
        <Menu
          ariaLabel={`Assign ${shownId}`}
          align="end"
          width={270}
          trigger={({ toggle }) => (
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Assign ${shownId}`}
              aria-haspopup="menu"
              onClick={toggle}
              className="gap-1 px-2 h-6 text-[11.5px] font-semibold rounded-md border border-dashed border-muted-foreground/60 text-muted-foreground hover:border-solid hover:border-primary hover:text-primary"
            >
              <Plus className="w-3 h-3" />
              {(!compact || keepActionLabel) && 'Assign'}
            </Button>
          )}
        >
          <MenuLabel>
            Assign <TicketRef ticket={ticket} /> to
          </MenuLabel>
          {assignees.map((user) => (
            <MenuItem
              key={user.id}
              checked={false}
              icon={<Avatar id={user.id} name={user.name} />}
              onSelect={() => onAssign(ticket.id, user.id)}
            >
              {user.name}
            </MenuItem>
          ))}
          {assignees.length === 0 && (
            <MenuNote>Nobody in this workspace can own tickets yet.</MenuNote>
          )}
        </Menu>
      </span>
    );
  }

  if (ticket.assigneeId === null) {
    return (
      <Tooltip content="Assign to yourself" size="sm">
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Claim ${shownId}`}
          disabled={currentUserId === null}
          onClick={(event) => {
            stop(event);
            if (currentUserId !== null) onAssign(ticket.id, currentUserId);
          }}
          className="gap-1 px-2 h-6 text-[11.5px] font-semibold rounded-md border border-dashed border-muted-foreground/60 text-muted-foreground hover:border-solid hover:border-primary hover:text-primary"
        >
          <Plus className="w-3 h-3" />
          {(!compact || keepActionLabel) && 'Claim'}
        </Button>
      </Tooltip>
    );
  }

  const assigneeId = ticket.assigneeId;
  return (
    <span onClick={stop} onKeyDown={stop} role="presentation" className="inline-flex min-w-0">
      <Menu
        ariaLabel={`Assign ${shownId}`}
        align="end"
        width={270}
        trigger={({ open, toggle }) => (
          <Tooltip
            content={open ? null : `Assigned to ${mine ? 'you' : name} · click to re-assign`}
            size="sm"
          >
            <Button
              variant="ghost"
              aria-label={`Re-assign ${shownId}`}
              aria-haspopup="menu"
              onClick={toggle}
              className="gap-1.5 justify-start px-0.5 pr-2 h-auto min-w-0 font-normal rounded-full text-[12.5px]"
            >
              <Avatar id={assigneeId} name={name} />
              {!compact && (
                <span className="truncate">
                  {name}
                  {mine && <span className="text-muted-foreground"> (you)</span>}
                </span>
              )}
            </Button>
          </Tooltip>
        )}
      >
        <MenuLabel>
          Assign <TicketRef ticket={ticket} /> to
        </MenuLabel>
        {assignees.map((user) => (
          <MenuItem
            key={user.id}
            checked={user.id === assigneeId}
            icon={<Avatar id={user.id} name={user.name} />}
            onSelect={() => {
              if (user.id !== assigneeId) onAssign(ticket.id, user.id);
            }}
          >
            {user.name}
            {user.id === currentUserId && <span className="text-muted-foreground"> (you)</span>}
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem
          icon={<UserMinus className="w-3.5 h-3.5" />}
          onSelect={() => onAssign(ticket.id, null)}
        >
          Unassign
        </MenuItem>
      </Menu>
    </span>
  );
};
