import { useState, useEffect } from 'react';
import type { Ticket, TicketStatus, TicketPriority, Message } from '../types';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { ExternalLink } from './ui/ExternalLink';
import { formatDate } from '../lib/utils';
import { ExternalLink as ExternalLinkIcon, Edit2, Send, Trash2, User, Calendar, Mail } from 'lucide-react';
import { Link } from 'react-router-dom';
import { messageService } from '../services/message.service';
import { TicketComments } from './TicketComments';

type TicketDetailProps = {
  ticket: Ticket;
  onPushToJira?: () => void;
  onDelete?: () => void;
  isPushingToJira?: boolean;
};

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

export const TicketDetail = ({
  ticket,
  onPushToJira,
  onDelete,
  isPushingToJira,
}: TicketDetailProps) => {
  const [linkedMessages, setLinkedMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);

  useEffect(() => {
    const fetchLinkedMessages = async () => {
      try {
        setLoadingMessages(true);
        const response = await messageService.getAll({ ticketId: ticket.id.toString() });
        setLinkedMessages(response.data || []);
      } catch (error) {
        console.error('Error fetching linked messages:', error);
        setLinkedMessages([]);
      } finally {
        setLoadingMessages(false);
      }
    };

    fetchLinkedMessages();
  }, [ticket.id]);

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="space-y-4">
        <div>
          <h2 className="mb-3 text-2xl font-bold">{ticket.title}</h2>
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex gap-2 items-center">
              <span className="text-sm font-medium text-muted-foreground">Status:</span>
              <Badge variant={statusColors[ticket.status]}>{ticket.status}</Badge>
            </div>
            <div className="flex gap-2 items-center">
              <span className="text-sm font-medium text-muted-foreground">Priority:</span>
              <Badge variant={priorityColors[ticket.priority]}>{ticket.priority}</Badge>
            </div>
            {ticket.categoryName && (
              <div className="flex gap-2 items-center">
                <span className="text-sm font-medium text-muted-foreground">Category:</span>
                <Badge variant="default">{ticket.categoryName}</Badge>
              </div>
            )}
            {ticket.externalId && ticket.externalUrl && (
              <ExternalLink
                href={ticket.externalUrl}
                onClick={() => {
                  console.log('Opening Jira URL:', ticket.externalUrl);
                }}
              >
                {ticket.externalId}
              </ExternalLink>
            )}
          </div>
          {ticket.externalId && (
            <div className="flex gap-2 items-center p-3 mt-3 text-sm bg-blue-50 rounded-lg border border-blue-200">
              <ExternalLinkIcon className="w-4 h-4 text-blue-600" />
              <p className="text-blue-900">
                <strong>Synced with Jira.</strong> This ticket is managed in Jira. Changes made in
                Jira will automatically sync here.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-2 gap-4 pt-6 border-t">
        <div>
          <div className="flex gap-2 items-center mb-1 text-sm text-muted-foreground">
            <User className="w-4 h-4" />
            From
          </div>
          <p className="font-medium">{ticket.sender}</p>
        </div>

        <div>
          <div className="flex gap-2 items-center mb-1 text-sm text-muted-foreground">
            <Calendar className="w-4 h-4" />
            Created
          </div>
          <p className="font-medium">{formatDate(ticket.createdAt)}</p>
        </div>

        {ticket.assigneeId && (
          <div>
            <div className="flex gap-2 items-center mb-1 text-sm text-muted-foreground">
              <User className="w-4 h-4" />
              Assigned To
            </div>
            <p className="font-medium">Agent #{ticket.assigneeId}</p>
          </div>
        )}
      </div>

      {/* Description */}
      <div className="pt-6 border-t">
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Description</h3>
        <div className="max-w-none prose prose-sm">
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{ticket.description}</p>
        </div>
      </div>

      {/* Linked Messages */}
      {!loadingMessages && linkedMessages.length > 0 && (
        <div className="pt-6 border-t">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
            Linked Messages ({linkedMessages.length})
          </h3>
          <div className="space-y-2">
            {linkedMessages.map((message) => (
              <div
                key={message.id}
                className="p-3 bg-gray-50 rounded-lg border border-gray-200 transition-colors hover:bg-gray-100"
              >
                <div className="flex gap-3 justify-between items-start">
                  <div className="flex flex-1 gap-3 items-start min-w-0">
                    <div className="p-2 bg-blue-50 rounded">
                      <Mail className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex gap-2 items-center mb-1">
                        <Badge variant="secondary" className="text-xs">
                          {message.channel}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(message.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm font-medium truncate">{message.sender}</p>
                      {message.subject && (
                        <p className="text-sm truncate text-muted-foreground">{message.subject}</p>
                      )}
                    </div>
                  </div>
                  <Link
                    to={`/messages?id=${message.id}`}
                    className="inline-flex gap-1 items-center px-2 py-1 text-xs font-medium text-blue-600 whitespace-nowrap rounded transition-colors hover:text-blue-800 hover:bg-blue-50"
                  >
                    View
                    <ExternalLinkIcon className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Metadata */}
      {ticket.metadata &&
        (() => {
          // Filter out embedding field
          const { embedding, ...displayMetadata } = ticket.metadata;
          return Object.keys(displayMetadata).length > 0 ? (
            <div className="pt-6 border-t">
              <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
                Additional Information
              </h3>
              <div className="p-4 bg-gray-50 rounded-lg">
                <pre className="overflow-auto text-xs">
                  {JSON.stringify(displayMetadata, null, 2)}
                </pre>
              </div>
            </div>
          ) : null;
        })()}

      {/* Comments */}
      <div className="pt-6 border-t">
        <TicketComments ticketId={ticket.id} hasJiraLink={!!ticket.externalId} />
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-6 border-t">
        <Link to={`/tickets/edit/${ticket.id}`} className="flex-1">
          <Button variant="outline" className="w-full">
            <Edit2 className="mr-2 w-4 h-4" />
            Edit Ticket
          </Button>
        </Link>
        {!ticket.externalId && onPushToJira && (
          <Button onClick={onPushToJira} isLoading={isPushingToJira} className="flex-1">
            <Send className="mr-2 w-4 h-4" />
            Push to Jira
          </Button>
        )}
        {onDelete && (
          <Button onClick={onDelete} variant="destructive">
            <Trash2 className="mr-2 w-4 h-4" />
            Delete
          </Button>
        )}
      </div>
    </div>
  );
};
