import { useState, useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';
import { addNoopenerHook } from '@/components/messages/messageDetailConstants';

addNoopenerHook(DOMPurify);
import {
  ExternalLink as ExternalLinkIcon,
  Send,
  Trash2,
  Link as LinkIcon,
  Maximize2,
  Tag,
  X,
  Plus,
  Pencil,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { AssignmentSelect } from '@/components/admin/AssignmentSelect';
import RichTextEditor from '@/components/shared/RichTextEditor';
import { TicketPanelTabs } from './TicketPanelTabs';
import { TranslateButton } from '@/components/shared/TranslateButton';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { formatDate, safeCssColor } from '@/lib/utils';
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
  const [editingDescription, setEditingDescription] = useState(false);
  const [localDescription, setLocalDescription] = useState(ticket.description ?? '');
  const [translatedDescription, setTranslatedDescription] = useState<string | null>(null);

  useEffect(() => {
    if (!showLabelPicker) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (labelPickerRef.current && !labelPickerRef.current.contains(event.target as Node)) {
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
    if (!editingDescription) {
      setLocalDescription(ticket.description ?? '');
    }
  }, [ticket.id, ticket.status, ticket.priority, ticket.categoryId, ticket.description, editingDescription]);

  useEffect(() => {
    categoryService.getAll()
      .then((res) => { if (res.data) setCategories(res.data); })
      .catch((err) => { logger.error('Failed to load categories:', err); });
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
      .catch((err) => { logger.error(err); });
  }, [ticket.id]);

  const handleToggleLabel = async (label: Label) => {
    const assigned = ticketLabels.some((lbl) => lbl.id === label.id);
    try {
      if (assigned) {
        await labelService.removeLabelFromTicket(ticket.id, label.id);
        setTicketLabels((prev) => prev.filter((lbl) => lbl.id !== label.id));
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
        const response = await messageService.getAll({ ticketId: ticket.id.toString() }, 1, 100);
        const sorted = (response.data ?? []).sort(
          (msgA, msgB) => new Date(msgA.createdAt).getTime() - new Date(msgB.createdAt).getTime()
        );
        setLinkedMessages(sorted);
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
                  onChange={(val) => { setLocalStatus(val as TicketStatus); void handleFieldUpdate('status', val); }}
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
                  onChange={(val) => { setLocalPriority(val as TicketPriority); void handleFieldUpdate('priority', val); }}
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
                  onChange={(val) => { setLocalCategoryId(val); void handleFieldUpdate('categoryId', val); }}
                  options={[
                    { value: '', label: 'None' },
                    ...categories.map((cat) => ({ value: cat.id.toString(), label: cat.name })),
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
                  style={{ backgroundColor: safeCssColor(label.color) }}
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
                  onClick={() => setShowLabelPicker((val) => !val)}
                  title="Add label"
                >
                  <Tag className="w-3 h-3 mr-1" />
                  <Plus className="w-3 h-3" />
                </Button>
                {showLabelPicker && allLabels.length > 0 && (
                  <div className="absolute top-full left-0 mt-1 z-50 min-w-[160px] rounded-lg border bg-card shadow-md p-1">
                    {allLabels.map((label) => {
                      const isAssigned = ticketLabels.some((lbl) => lbl.id === label.id);
                      return (
                        <button
                          key={label.id}
                          onClick={() => handleToggleLabel(label)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent text-left"
                        >
                          <span
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: safeCssColor(label.color) }}
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

      {/* Meta strip — From, Created, Assigned */}
      <div className="pt-4 border-t">
        <div className="grid grid-cols-[80px_1fr] gap-x-4 gap-y-2.5 items-center">
          <span className="font-mono text-[11px] tracking-wide uppercase text-muted-foreground">From</span>
          <span className="text-sm font-medium truncate">{ticket.sender}</span>

          <span className="font-mono text-[11px] tracking-wide uppercase text-muted-foreground">Created</span>
          <span className="text-sm text-muted-foreground">{formatDate(ticket.createdAt)}</span>

          <span className="font-mono text-[11px] tracking-wide uppercase text-muted-foreground self-center">Assigned</span>
          <AssignmentSelect
            type="ticket"
            itemId={ticket.id}
            currentAssigneeId={ticket.assigneeId}
            onAssign={onRefresh}
          />
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex flex-wrap gap-2 pt-4 border-t">
        <Button onClick={handleCopyLink} variant="outline" size="sm">
          <LinkIcon className="mr-2 w-4 h-4" />
          {linkCopied ? 'Link Copied!' : 'Copy Link'}
        </Button>
        {!ticket.externalId && onPushToJira && (
          <Button onClick={onPushToJira} isLoading={isPushingToJira} size="sm">
            <Send className="mr-2 w-4 h-4" />
            Push to Jira
          </Button>
        )}
        {onDelete && (
          <Button onClick={onDelete} variant="destructive" size="sm">
            <Trash2 className="mr-2 w-4 h-4" />
            Delete
          </Button>
        )}
      </div>

      {/* Description */}
      <div className="pt-6 border-t">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-semibold text-muted-foreground">Description</h3>
          <div className="flex gap-1 items-center">
            {hasManageTickets && !ticket.externalId && !editingDescription && (
              <Button
                variant="ghost"
                size="sm"
                title="Edit description"
                onClick={() => setEditingDescription(true)}
              >
                <Pencil className="w-3.5 h-3.5" />
              </Button>
            )}
            <TranslateButton
              ticketId={ticket.id}
              onTranslated={(content) => setTranslatedDescription(content)}
              onCleared={() => setTranslatedDescription(null)}
            />
          </div>
        </div>
        {editingDescription ? (
          <div className="space-y-2">
            <RichTextEditor
              content={localDescription}
              onChange={setLocalDescription}
              placeholder="Enter ticket description..."
              minHeight="120px"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => { void handleFieldUpdate('description', localDescription); setEditingDescription(false); }}
              >
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setLocalDescription(ticket.description ?? ''); setEditingDescription(false); }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div
            className="max-w-none break-words prose prose-sm text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(translatedDescription ?? ticket.description ?? '', { ALLOWED_TAGS: ['p', 'br', 'b', 'i', 'u', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'h1', 'h2', 'h3', 'h4'], ALLOWED_ATTR: ['href', 'target', 'rel'], ALLOWED_URI_REGEXP: /^https?:/i }) }}
          />
        )}
      </div>

      <TicketPanelTabs
        ticketId={ticket.id}
        hasJiraLink={!!ticket.externalId}
        linkedMessages={linkedMessages}
        loadingMessages={loadingMessages}
      />

    </div>
  );
};
