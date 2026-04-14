import { useState, useEffect, useRef } from 'react';
import {
  ExternalLink as ExternalLinkIcon,
  Send,
  Trash2,
  User,
  Calendar,
  Mail,
  Link as LinkIcon,
  Maximize2,
  Tag,
  X,
  Plus,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { AssignmentSelect } from '@/components/admin/AssignmentSelect';
import { ScrollButtons } from '@/components/shared/ScrollButtons';
import { TicketAttachments } from './TicketAttachments';
import { TicketComments } from './TicketComments';
import { TranslateButton } from '@/components/shared/TranslateButton';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { formatDate } from '@/lib/utils';
import { categoryService } from '@/services/category.service';
import { messageService } from '@/services/message.service';
import { labelService, type Label } from '@/services/settings.service';
import { ticketService } from '@/services/ticket.service';
import { usePermissions } from '@/hooks/usePermissions';
import { Permission } from '@/types/roles';
import type { Ticket, TicketStatus, TicketPriority, Message, Category } from '@/types';
import { logger } from '@/lib/logger';

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
  const { hasPermission } = usePermissions();
  const hasManageLabels = hasPermission(Permission.MANAGE_LABELS);
  const hasManageTickets = hasPermission(Permission.MANAGE_TICKETS);
  const [categories, setCategories] = useState<Category[]>([]);
  const [localStatus, setLocalStatus] = useState<TicketStatus>(ticket.status);
  const [localPriority, setLocalPriority] = useState<TicketPriority>(ticket.priority);
  const [localCategoryId, setLocalCategoryId] = useState<string>(ticket.categoryId?.toString() ?? '');
  const [linkedMessages, setLinkedMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [linkCopied, setLinkCopied] = useState(false);
  const [ticketLabels, setTicketLabels] = useState<Label[]>([]);
  const [allLabels, setAllLabels] = useState<Label[]>([]);
  const [showLabelPicker, setShowLabelPicker] = useState(false);
  const labelPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showLabelPicker) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (labelPickerRef.current && !labelPickerRef.current.contains(e.target as Node)) {
        setShowLabelPicker(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showLabelPicker]);

  const handleCopyLink = () => {
    const url = `${window.location.origin}/tickets?id=${ticket.id}`;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      })
      .catch((err) => {
        logger.error('Failed to copy link:', err);
      });
  };

  useEffect(() => {
    setLocalStatus(ticket.status);
    setLocalPriority(ticket.priority);
    setLocalCategoryId(ticket.categoryId?.toString() ?? '');
  }, [ticket.id, ticket.status, ticket.priority, ticket.categoryId]);

  useEffect(() => {
    categoryService.getAll().then((res) => { if (res.data) setCategories(res.data); }).catch(() => {});
  }, []);

  const handleFieldUpdate = async (field: string, value: string) => {
    try {
      await ticketService.update(ticket.id, { [field]: field === 'categoryId' ? (value ? parseInt(value) : undefined) : value });
      onRefresh?.();
    } catch (err) {
      logger.error('Failed to update ticket field:', err);
    }
  };

  useEffect(() => {
    Promise.all([
      labelService.getTicketLabels(ticket.id),
      labelService.getLabels(),
    ])
      .then(([tl, al]) => { setTicketLabels(tl); setAllLabels(al); })
      .catch((e) => { logger.error(e); });
  }, [ticket.id]);

  const handleToggleLabel = async (label: Label) => {
    const assigned = ticketLabels.some((l) => l.id === label.id);
    try {
      if (assigned) {
        await labelService.removeLabelFromTicket(ticket.id, label.id);
        setTicketLabels((prev) => prev.filter((l) => l.id !== label.id));
      } else {
        await labelService.assignLabelToTicket(ticket.id, label.id);
        setTicketLabels((prev) => [...prev, label]);
      }
    } catch (error) {
      logger.error('Failed to toggle label:', error);
    }
  };

  useEffect(() => {
    const fetchLinkedMessages = async () => {
      try {
        setLoadingMessages(true);
        const response = await messageService.getAll({ ticketId: ticket.id.toString() });
        setLinkedMessages(response.data ?? []);
      } catch (error) {
        logger.error('Error fetching linked messages:', error);
        setLinkedMessages([]);
      } finally {
        setLoadingMessages(false);
      }
    };

    fetchLinkedMessages().catch((error) => {
      logger.error('Failed to fetch linked messages:', error);
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
              {hasManageTickets && !ticket.externalId ? (
                <ReactSelect
                  value={localStatus}
                  onChange={(v) => { setLocalStatus(v as TicketStatus); void handleFieldUpdate('status', v); }}
                  options={[
                    { value: 'pending', label: 'Pending' },
                    { value: 'open', label: 'Open' },
                    { value: 'in_progress', label: 'In Progress' },
                    { value: 'resolved', label: 'Resolved' },
                    { value: 'closed', label: 'Closed' },
                  ]}
                  className="min-w-[130px]"
                />
              ) : (
                <Badge variant={statusColors[localStatus]}>{localStatus}</Badge>
              )}
            </div>
            <div className="flex gap-2 items-center">
              <span className="text-sm font-medium text-muted-foreground">Priority:</span>
              {hasManageTickets && !ticket.externalId ? (
                <ReactSelect
                  value={localPriority}
                  onChange={(v) => { setLocalPriority(v as TicketPriority); void handleFieldUpdate('priority', v); }}
                  options={[
                    { value: 'low', label: 'Low' },
                    { value: 'medium', label: 'Medium' },
                    { value: 'high', label: 'High' },
                    { value: 'critical', label: 'Critical' },
                  ]}
                  className="min-w-[120px]"
                />
              ) : (
                <Badge variant={priorityColors[localPriority]}>{localPriority}</Badge>
              )}
            </div>
            <div className="flex gap-2 items-center">
              <span className="text-sm font-medium text-muted-foreground">Category:</span>
              {hasManageTickets && !ticket.externalId ? (
                <ReactSelect
                  value={localCategoryId}
                  onChange={(v) => { setLocalCategoryId(v); void handleFieldUpdate('categoryId', v); }}
                  options={[
                    { value: '', label: 'None' },
                    ...categories.map((c) => ({ value: c.id.toString(), label: c.name })),
                  ]}
                  className="min-w-[140px]"
                  isSearchable
                />
              ) : (
                ticket.categoryName ? <Badge variant="default">{ticket.categoryName}</Badge> : null
              )}
            </div>
            {/* Labels */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {ticketLabels.map((label) => (
                <span
                  key={label.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white"
                  style={{ backgroundColor: label.color }}
                >
                  {label.name}
                  {hasManageLabels && (
                    <button
                      onClick={() => handleToggleLabel(label)}
                      className="opacity-70 hover:opacity-100 ml-0.5"
                      title={`Remove ${label.name}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </span>
              ))}
              {hasManageLabels && <div className="relative" ref={labelPickerRef}>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5 text-xs"
                  onClick={() => setShowLabelPicker((v) => !v)}
                  title="Add label"
                >
                  <Tag className="w-3 h-3 mr-1" />
                  <Plus className="w-3 h-3" />
                </Button>
                {showLabelPicker && allLabels.length > 0 && (
                  <div className="absolute top-full left-0 mt-1 z-50 min-w-[160px] rounded-lg border bg-card shadow-md p-1">
                    {allLabels.map((label) => {
                      const isAssigned = ticketLabels.some((l) => l.id === label.id);
                      return (
                        <button
                          key={label.id}
                          onClick={() => handleToggleLabel(label)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent text-left"
                        >
                          <span
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: label.color }}
                          />
                          <span className="flex-1">{label.name}</span>
                          {isAssigned && <span className="text-xs text-muted-foreground">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>}
            </div>

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

      {/* Metadata */}
      {ticket.metadata &&
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
