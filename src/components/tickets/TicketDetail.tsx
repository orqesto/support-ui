import { useState, useEffect } from 'react';
import {
  ExternalLink as ExternalLinkIcon,
  Edit2,
  Send,
  Trash2,
  User,
  Calendar,
  Mail,
  Link as LinkIcon,
  Maximize2,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { AssignmentSelect } from '@/components/admin/AssignmentSelect';
import { ScrollButtons } from '@/components/shared/ScrollButtons';
import { LeadQualificationPanel } from './LeadQualificationPanel';
import { TicketAttachments } from './TicketAttachments';
import { TicketComments } from './TicketComments';
import { TranslateButton } from '@/components/shared/TranslateButton';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { formatDate } from '@/lib/utils';
import { messageService } from '@/services/message.service';
import type { Ticket, TicketStatus, TicketPriority, Message } from '@/types';

type TicketDetailProps = {
  ticket: Ticket;
  onPushToJira?: () => void;
  onDelete?: () => void;
  onRefresh?: () => void;
  isPushingToJira?: boolean;
  showFullPageButton?: boolean;
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
  onRefresh,
  isPushingToJira,
  showFullPageButton = true,
}: TicketDetailProps) => {
  const location = useLocation();
  const isFullPage = location.pathname.startsWith('/tickets/');
  const [linkedMessages, setLinkedMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [linkCopied, setLinkCopied] = useState(false);

  const handleCopyLink = () => {
    const url = `${window.location.origin}/tickets?id=${ticket.id}`;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      })
      .catch((err) => {
        console.error('Failed to copy link:', err);
      });
  };

  useEffect(() => {
    const fetchLinkedMessages = async () => {
      try {
        setLoadingMessages(true);
        const response = await messageService.getAll({ ticketId: ticket.id.toString() });
        setLinkedMessages(response.data ?? []);
      } catch (error) {
        console.error('Error fetching linked messages:', error);
        setLinkedMessages([]);
      } finally {
        setLoadingMessages(false);
      }
    };

    fetchLinkedMessages().catch((error) => {
      console.error('Failed to fetch linked messages:', error);
    });
  }, [ticket.id]);

  return (
    <div className="relative space-y-6">
      {/* Only show ScrollButtons in drawer mode (not full-page, page has its own) */}
      {!isFullPage && <ScrollButtons bottomTarget="[data-ticket-actions]" />}

      {/* Header Section */}
      <div className="space-y-4">
        <div>
          <div className="flex gap-3 items-center mb-2">
            <h2 className="flex-1 text-2xl font-bold">{ticket.title}</h2>
            <span className="px-2 py-1 font-mono text-xs rounded bg-muted text-muted-foreground">
              #{ticket.id}
            </span>
            {showFullPageButton && !isFullPage && (
              <Link to={`/tickets/${ticket.id}`}>
                <Button variant="ghost" size="sm" title="Open in full page">
                  <Maximize2 className="w-4 h-4" />
                </Button>
              </Link>
            )}
          </div>
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
              <ExternalLink href={ticket.externalUrl}>{ticket.externalId}</ExternalLink>
            )}
          </div>
          {ticket.externalId && (
            <div className="flex gap-2 items-center p-3 mt-3 text-sm rounded-lg border bg-blue-500/10 dark:bg-blue-500/10 border-blue-500/20">
              <ExternalLinkIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <p className="text-blue-600 dark:text-blue-400">
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
      </div>

      {/* Assignment */}
      <div className="pt-6 border-t">
        <p className="mb-2 text-sm text-muted-foreground">Assigned to</p>
        <AssignmentSelect
          type="ticket"
          itemId={ticket.id}
          currentAssigneeId={ticket.assigneeId}
          onAssign={onRefresh}
          className="w-full"
        />
      </div>

      {/* Description */}
      <div className="pt-6 border-t">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-semibold text-muted-foreground">Description</h3>
          <TranslateButton
            ticketId={ticket.id}
            originalContent={ticket.description}
            originalSubject={ticket.title}
            variant="ghost"
            size="sm"
          />
        </div>
        <div
          className="max-w-none break-words prose prose-sm text-sm leading-relaxed"
          dangerouslySetInnerHTML={{ __html: ticket.description }}
        />
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
                className="p-3 rounded-lg border transition-colors bg-muted border-border hover:bg-accent"
              >
                <div className="flex gap-3 justify-between items-start">
                  <div className="flex flex-1 gap-3 items-start min-w-0">
                    <div className="p-2 rounded bg-blue-500/10 dark:bg-blue-500/10">
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
                    className="inline-flex gap-1 items-center px-2 py-1 text-xs font-medium text-blue-600 whitespace-nowrap rounded transition-colors dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:bg-blue-500/10"
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

      {/* Lead Qualification Panel */}
      {!!ticket.metadata?.leadState && (
        <div className="pt-6 border-t">
          <LeadQualificationPanel
            leadState={
              ticket.metadata.leadState as Parameters<typeof LeadQualificationPanel>[0]['leadState']
            }
          />
        </div>
      )}

      {/* Metadata (non-lead-qual tickets only) */}
      {ticket.metadata &&
        !ticket.metadata.leadState &&
        (() => {
          const { embedding, ...displayMetadata } = ticket.metadata;
          return Object.keys(displayMetadata).length > 0 ? (
            <div className="pt-6 border-t">
              <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
                Additional Information
              </h3>
              <div className="p-4 rounded-lg bg-muted">
                <pre className="overflow-auto text-xs">
                  {JSON.stringify(displayMetadata, null, 2)}
                </pre>
              </div>
            </div>
          ) : null;
        })()}

      {/* Attachments (from Jira, Email, or Uploads) */}
      <TicketAttachments ticketId={ticket.id} />

      {/* Comments */}
      <div className="pt-6 border-t">
        <TicketComments ticketId={ticket.id} hasJiraLink={!!ticket.externalId} />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-6 border-t" data-ticket-actions>
        <Button onClick={handleCopyLink} variant="outline" size="sm">
          <LinkIcon className="mr-2 w-4 h-4" />
          {linkCopied ? 'Link Copied!' : 'Copy Link'}
        </Button>
        {!ticket.externalId ? (
          <Link to={`/tickets/edit/${ticket.id}`} className="flex-1">
            <Button variant="outline" className="w-full">
              <Edit2 className="mr-2 w-4 h-4" />
              Edit Ticket
            </Button>
          </Link>
        ) : (
          <div className="flex-1">
            <Button
              variant="outline"
              className="w-full"
              disabled
              title="This ticket is synced with Jira. Edit it in Jira instead."
            >
              <Edit2 className="mr-2 w-4 h-4" />
              Edit Ticket
            </Button>
            <p className="mt-1 text-xs text-center text-muted-foreground">
              Synced with Jira - Edit in Jira
            </p>
          </div>
        )}
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
