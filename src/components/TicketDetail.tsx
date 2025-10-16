import type { Ticket, TicketStatus, TicketPriority } from '../types';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { formatDate } from '../lib/utils';
import { ExternalLink, Edit2, Send, Trash2, User, Calendar, Tag } from 'lucide-react';
import { Link } from 'react-router-dom';

type TicketDetailProps = {
  ticket: Ticket;
  onPushToJira?: () => void;
  onDelete?: () => void;
  isPushingToJira?: boolean;
};

const statusColors: Record<TicketStatus, 'default' | 'success' | 'warning' | 'danger' | 'secondary'> = {
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

export const TicketDetail = ({ ticket, onPushToJira, onDelete, isPushingToJira }: TicketDetailProps) => {
  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold mb-3">{ticket.title}</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={statusColors[ticket.status]}>
              {ticket.status}
            </Badge>
            <Badge variant={priorityColors[ticket.priority]}>
              {ticket.priority}
            </Badge>
            {ticket.externalId && (
              <a
                href={ticket.externalUrl || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
              >
                <ExternalLink className="h-4 w-4" />
                {ticket.externalId}
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-2 gap-4 border-t pt-6">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <User className="h-4 w-4" />
            From
          </div>
          <p className="font-medium">{ticket.sender}</p>
        </div>

        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Calendar className="h-4 w-4" />
            Created
          </div>
          <p className="font-medium">{formatDate(ticket.createdAt)}</p>
        </div>

        {ticket.categoryName && (
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Tag className="h-4 w-4" />
              Category
            </div>
            <p className="font-medium">{ticket.categoryName}</p>
          </div>
        )}

        {ticket.assigneeId && (
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <User className="h-4 w-4" />
              Assigned To
            </div>
            <p className="font-medium">Agent #{ticket.assigneeId}</p>
          </div>
        )}
      </div>

      {/* Description */}
      <div className="border-t pt-6">
        <h3 className="text-sm font-semibold text-muted-foreground mb-3">Description</h3>
        <div className="prose prose-sm max-w-none">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{ticket.description}</p>
        </div>
      </div>

      {/* Metadata */}
      {ticket.metadata && Object.keys(ticket.metadata).length > 0 && (
        <div className="border-t pt-6">
          <h3 className="text-sm font-semibold text-muted-foreground mb-3">Additional Information</h3>
          <div className="bg-gray-50 rounded-lg p-4">
            <pre className="text-xs overflow-auto">
              {JSON.stringify(ticket.metadata, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="border-t pt-6 flex gap-2">
        <Link to={`/tickets/edit/${ticket.id}`} className="flex-1">
          <Button variant="outline" className="w-full">
            <Edit2 className="h-4 w-4 mr-2" />
            Edit Ticket
          </Button>
        </Link>
        {!ticket.externalId && onPushToJira && (
          <Button
            onClick={onPushToJira}
            isLoading={isPushingToJira}
            className="flex-1"
          >
            <Send className="h-4 w-4 mr-2" />
            Push to Jira
          </Button>
        )}
        {onDelete && (
          <Button onClick={onDelete} variant="destructive">
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        )}
      </div>
    </div>
  );
};
