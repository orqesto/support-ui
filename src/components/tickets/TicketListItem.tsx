import { ExternalLink as ExternalLinkIcon, Send, Trash2, User, Target, CircleDot } from 'lucide-react';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { ListCard } from '@/components/ui/ListCard';
import { formatDate, formatAge } from '@/lib/utils';
import type { Ticket, TicketStatus, TicketPriority } from '@/types';
import { Permission } from '@/types/roles';

const STATUS_BADGE: Record<
  TicketStatus,
  { variant: 'default' | 'success' | 'warning' | 'danger' | 'secondary'; label: string; className?: string }
> = {
  pending:     { variant: 'warning',   label: 'Pending' },
  open:        { variant: 'secondary', label: 'Open' },
  in_progress: { variant: 'warning',   label: 'In Progress' },
  resolved:    { variant: 'success',   label: 'Resolved' },
  closed:      { variant: 'secondary', label: 'Closed', className: 'text-muted-foreground' },
};

const PRIORITY_BADGE: Record<
  TicketPriority,
  { variant: 'default' | 'success' | 'warning' | 'danger' }
> = {
  low:      { variant: 'success' },
  medium:   { variant: 'default' },
  high:     { variant: 'warning' },
  critical: { variant: 'danger' },
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
}: TicketListItemProps) => {
  const statusCfg = STATUS_BADGE[ticket.status];
  const priorityCfg = PRIORITY_BADGE[ticket.priority];

  return (
    <ListCard
      header={
        <>
          {/* Status */}
          <Badge variant={statusCfg.variant} className={`flex gap-1 items-center ${statusCfg.className ?? ''}`}>
            <CircleDot className="w-3 h-3" />
            {statusCfg.label}
          </Badge>

          {/* Priority — skip medium (default/unremarkable) */}
          {ticket.priority !== 'medium' && (
            <Badge variant={priorityCfg.variant}>
              {ticket.priority}
            </Badge>
          )}

          {/* Category */}
          {ticket.categoryName && (
            <Badge variant="default">{ticket.categoryName}</Badge>
          )}

          {/* Lead origin */}
          {(ticket.metadata as { wasLead?: boolean } | null)?.wasLead && (
            <Badge variant="default" className="flex gap-1 items-center" title="Created from a lead">
              <Target className="w-3 h-3" />
              Lead
            </Badge>
          )}

          {/* Assignee */}
          {ticket.assigneeName && (
            <Badge variant="secondary" className="flex gap-1 items-center">
              <User className="w-3 h-3" />
              {ticket.assigneeName}
            </Badge>
          )}

          {/* Labels */}
          {ticket.labels && ticket.labels.length > 0 && (
            <div className="flex gap-1 items-center flex-wrap">
              {ticket.labels.map((label) => (
                <span
                  key={label.id}
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white"
                  style={{ backgroundColor: label.color }}
                  title={label.name}
                >
                  {label.name}
                </span>
              ))}
            </div>
          )}

          {/* Jira link */}
          {ticket.externalId && ticket.externalUrl && (
            <ExternalLink href={ticket.externalUrl} className="text-xs">
              {ticket.externalId}
            </ExternalLink>
          )}
        </>
      }
      content={
        <>
          <p className="text-sm font-semibold truncate">{ticket.title}</p>
          {ticket.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {ticket.description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()}
            </p>
          )}
        </>
      }
      metadata={
        <>
          <span className="font-mono text-xs shrink-0">#{ticket.id}</span>
          <span className="truncate text-xs" title={ticket.sender}>
            {ticket.sender}
          </span>
          <span
            className="ml-auto whitespace-nowrap text-xs"
            title={`Created: ${formatDate(ticket.createdAt)}`}
          >
            {formatAge(ticket.createdAt)}
          </span>
        </>
      }
      actions={
        <>
          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onOpen(ticket); }}>
            <ExternalLinkIcon className="mr-1 w-3 h-3" />
            Open
          </Button>
          <PermissionGuard permission={Permission.MANAGE_TICKETS}>
            {!ticket.externalId && (
              <Button
                size="sm"
                onClick={(e) => { e.stopPropagation(); onPushToJira(ticket.id); }}
                isLoading={isSyncing}
              >
                <Send className="mr-1 w-3 h-3" />
                Push
              </Button>
            )}
          </PermissionGuard>
          <PermissionGuard permissions={[Permission.DELETE_TICKETS, Permission.MANAGE_ORGANIZATION]}>
            <Button
              size="sm"
              variant="destructive"
              onClick={(e) => { e.stopPropagation(); onDelete(ticket); }}
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
};
