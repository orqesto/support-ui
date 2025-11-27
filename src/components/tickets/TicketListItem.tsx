import { Edit2, Send, Trash2, ExternalLink as ExternalLinkIcon, User } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { ListCard } from '@/components/ui/ListCard';
import { formatDate } from '@/lib/utils';
import type { Ticket, TicketStatus, TicketPriority } from '@/types';
import { Permission } from '@/types/roles';

const statusColors: Record<
  TicketStatus,
  'default' | 'success' | 'warning' | 'danger' | 'secondary'
> = {
  pending: 'warning',
  open: 'default',
  in_progress: 'default',
  resolved: 'success',
  closed: 'secondary',
};

const priorityColors: Record<TicketPriority, 'default' | 'success' | 'warning' | 'danger'> = {
  low: 'success',
  medium: 'default',
  high: 'warning',
  critical: 'danger',
};

type TicketListItemProps = {
  ticket: Ticket;
  isSyncing: boolean;
  onOpen: (ticket: Ticket) => void;
  onPushToJira: (ticketId: number) => void;
  onDelete: (ticket: Ticket) => void;
};

export const TicketListItem = ({
  ticket,
  isSyncing,
  onOpen,
  onPushToJira,
  onDelete,
}: TicketListItemProps) => (
  <ListCard
    header={
      <>
        <div className="flex gap-2 items-start w-full">
          <h3 className="flex-1 text-lg font-semibold break-words">{ticket.title}</h3>
          <span className="px-2 py-0.5 text-xs font-mono rounded bg-muted text-muted-foreground whitespace-nowrap">
            #{ticket.id}
          </span>
        </div>
        <div className="flex gap-2 items-center">
          <span className="text-xs font-medium text-muted-foreground">Status:</span>
          <Badge variant={statusColors[ticket.status]}>{ticket.status}</Badge>
        </div>
        <div className="flex gap-2 items-center">
          <span className="text-xs font-medium text-muted-foreground">Priority:</span>
          <Badge variant={priorityColors[ticket.priority]}>{ticket.priority}</Badge>
        </div>
        {ticket.categoryName && (
          <div className="flex gap-2 items-center">
            <span className="text-xs font-medium text-muted-foreground">Category:</span>
            <Badge variant="default">{ticket.categoryName}</Badge>
          </div>
        )}
        {ticket.assigneeName && (
          <div className="flex gap-2 items-center">
            <span className="text-xs font-medium text-muted-foreground">Assignee:</span>
            <Badge variant="secondary" className="flex gap-1 items-center">
              <User className="w-3 h-3" />
              {ticket.assigneeName}
            </Badge>
          </div>
        )}
        {ticket.externalId && ticket.externalUrl && (
          <ExternalLink
            href={ticket.externalUrl}
            className="text-xs"
            onClick={() => {
              // eslint-disable-next-line no-console
              console.log('Opening Jira URL:', ticket.externalUrl);
            }}
          >
            {ticket.externalId}
          </ExternalLink>
        )}
      </>
    }
    content={<p className="text-sm text-muted-foreground line-clamp-2">{ticket.description}</p>}
    metadata={
      <>
        <span className="break-all">From: {ticket.sender}</span>
        {ticket.categoryName && <span>• {ticket.categoryName}</span>}
        {ticket.assigneeName && (
          <span className="flex gap-1 items-center">
            • <User className="w-3 h-3" />
            {ticket.assigneeName}
          </span>
        )}
        <span className="whitespace-nowrap">• {formatDate(ticket.createdAt)}</span>
      </>
    }
    actions={
      <>
        <Button size="sm" variant="outline" onClick={() => onOpen(ticket)}>
          <ExternalLinkIcon className="mr-1 w-3 h-3" />
          Open
        </Button>
        <PermissionGuard permission={Permission.MANAGE_TICKETS}>
          {!ticket.externalId && (
            <Link to={`/tickets/edit/${ticket.id}`}>
              <Button size="sm" variant="outline">
                <Edit2 className="mr-1 w-3 h-3" />
                Edit
              </Button>
            </Link>
          )}
          {!ticket.externalId && (
            <Button size="sm" onClick={() => onPushToJira(ticket.id)} isLoading={isSyncing}>
              <Send className="mr-1 w-3 h-3" />
              Push
            </Button>
          )}
        </PermissionGuard>
        <PermissionGuard permissions={[Permission.DELETE_TICKETS, Permission.MANAGE_ORGANIZATION]}>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => onDelete(ticket)}
            aria-label="Delete ticket"
          >
            <Trash2 className="mr-2 w-4 h-4" />
            Delete
          </Button>
        </PermissionGuard>
      </>
    }
  />
);
