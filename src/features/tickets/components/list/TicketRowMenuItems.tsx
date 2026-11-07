import { MenuItem, MenuSeparator } from '@/components/ui/Menu';
import type { Ticket } from '@/types';

/** The ⋯ menu of a ticket row. */
export const TicketRowMenuItems = ({
  ticket,
  canManage,
  canDelete,
  jiraOn,
  onOpen,
  onCopyLink,
  onPushToJira,
  onDelete,
}: {
  ticket: Ticket;
  canManage: boolean;
  /** DELETE_TICKETS or MANAGE_ORGANIZATION — what the server's delete route requires. */
  canDelete: boolean;
  jiraOn: boolean;
  onOpen: (ticket: Ticket) => void;
  onCopyLink: (ticketId: number) => void;
  onPushToJira: (ticketId: number) => void;
  onDelete: (ticket: Ticket) => void;
}) => (
  <>
    <MenuItem onSelect={() => onOpen(ticket)}>Open</MenuItem>
    <MenuItem onSelect={() => onCopyLink(ticket.id)}>Copy link</MenuItem>
    {canManage && jiraOn && !ticket.externalId && (
      <MenuItem onSelect={() => onPushToJira(ticket.id)}>Push to Jira</MenuItem>
    )}
    {canDelete && (
      <>
        <MenuSeparator />
        <MenuItem danger onSelect={() => onDelete(ticket)}>
          Delete ticket…
        </MenuItem>
      </>
    )}
  </>
);
