import { useState, useEffect, useRef, type ReactNode } from 'react';
import DOMPurify from 'dompurify';
import { addNoopenerHook } from '@/components/messages/messageDetailConstants';

addNoopenerHook(DOMPurify);
import { Lock, Maximize2, Pencil } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { AssignmentSelect } from '@/components/admin/AssignmentSelect';
import RichTextEditor from '@/components/shared/RichTextEditor';
import { MoveDepartmentDialog } from './MoveDepartmentDialog';
import { TicketPanelTabs } from './TicketPanelTabs';
import { TicketReachStrip } from './TicketReachStrip';
import { STATUS_DOT, StatusDot, plainText } from './list/ticketRowBits';
import {
  JiraSection,
  PRIORITY_OPTIONS,
  TicketMoreMenu,
  field,
  sectionTitle,
  shortStamp,
} from './ticketDetailParts';
import { TranslateButton } from '@/components/shared/TranslateButton';
import { Button } from '@/components/ui/Button';
import { TicketLabelsField } from './TicketLabelsField';
import { Tooltip } from '@/components/ui/Tooltip';
import { Card } from '@/components/ui/Card';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { formatAge } from '@/lib/utils';
import { useDepartmentById } from '@/hooks/useDepartments';
import { useElementWidth } from '@/hooks/useElementWidth';
import type { TicketThread } from '@/services/ticketThreads.service';
import { categoryService } from '@/services/category.service';
import { messageService } from '@/services/message.service';
import { ticketService } from '@/services/ticket.service';
import { ticketFieldPatch } from './ticketFieldPatch';
import { usePermissions } from '@/hooks/usePermissions';
import { useTeamsEnabled } from '@/hooks/useTeamsEnabled';
import { Permission } from '@/types/roles';
import type { Ticket, TicketStatus, TicketPriority, Message, Category } from '@/types';
import { logger } from '@/lib/logger';
import { allowedStatusOptions } from '@/lib/ticketStatus';

type TicketDetailProps = {
  ticket: Ticket;
  onPushToJira?: () => void;
  onDelete?: () => void;
  onRefresh?: () => void | Promise<void>;
  isPushingToJira?: boolean;
  showFullPageButton?: boolean;
  /** A Jira integration is connected: the sidebar's Jira section and Push to Jira show. */
  jiraOn?: boolean;
  /**
   * The chrome around the ticket (side sheet, full page) — handed the ⋯ menu for its bar and the
   * ticket body to render under it. Without it the body renders alone.
   */
  renderChrome?: (more: ReactNode, body: ReactNode) => ReactNode;
};

/** Below this width the sidebar folds into a Details tab (the design's 860 px container query). */
const SIDEBAR_MIN_WIDTH = 860;

const STATUS_LABELS: Record<TicketStatus, string> = {
  pending: 'Pending',
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const TicketDetail = ({
  ticket,
  onPushToJira,
  onDelete,
  onRefresh,
  isPushingToJira,
  showFullPageButton = true,
  jiraOn = false,
  renderChrome,
}: TicketDetailProps) => {
  const rootRef = useRef<HTMLDivElement>(null);
  // Wide until measured (and in jsdom): the sidebar is the layout the page is designed for.
  const wide = useElementWidth(rootRef, SIDEBAR_MIN_WIDTH) >= SIDEBAR_MIN_WIDTH;
  const department = useDepartmentById(ticket.departmentId);
  const [threads, setThreads] = useState<TicketThread[]>([]);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const location = useLocation();
  const isFullPage = location.pathname.startsWith('/tickets/');
  const { hasPermission } = usePermissions();
  const hasManageLabels = hasPermission(Permission.MANAGE_LABELS);
  const canViewLabels = hasPermission(Permission.VIEW_LABELS);
  const hasManageTickets = hasPermission(Permission.MANAGE_TICKETS);
  const canViewCategories = hasPermission(Permission.VIEW_CATEGORIES);
  const [categories, setCategories] = useState<Category[]>([]);
  const [localStatus, setLocalStatus] = useState<TicketStatus>(ticket.status);
  const [localPriority, setLocalPriority] = useState<TicketPriority>(ticket.priority);
  const [localCategoryId, setLocalCategoryId] = useState<string>(
    ticket.categoryId?.toString() ?? ''
  );
  const [linkedMessages, setLinkedMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [linkCopied, setLinkCopied] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  // Rename in place (contingency page, 2026-10-19) — the edit page is no longer the only way.
  const [editingTitle, setEditingTitle] = useState(false);
  const [localTitle, setLocalTitle] = useState(ticket.title);
  const [localDescription, setLocalDescription] = useState(ticket.description ?? '');
  const [translatedDescription, setTranslatedDescription] = useState<string | null>(null);
  const [moveDeptOpen, setMoveDeptOpen] = useState(false);
  // Teams off: one team, so there is nowhere to move a ticket.
  const teamsEnabled = useTeamsEnabled();

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
    if (!editingTitle) setLocalTitle(ticket.title);
  }, [
    ticket.id,
    ticket.status,
    ticket.priority,
    ticket.categoryId,
    ticket.description,
    ticket.title,
    editingDescription,
    editingTitle,
  ]);

  // The editor closes only once the save and the reload are done: closing it re-syncs the title
  // from `ticket`, which until then still holds the old one (staging 2026-10-19: the page kept
  // showing the old title after a save that had gone through).
  const [savingTitle, setSavingTitle] = useState(false);
  const saveTitle = async () => {
    const next = localTitle.trim();
    if (!next || next === ticket.title) {
      setLocalTitle(ticket.title);
      setEditingTitle(false);
      return;
    }
    setSavingTitle(true);
    try {
      await ticketService.update(ticket.id, ticketFieldPatch('title', next));
      await onRefresh?.();
    } catch (err) {
      logger.error('Failed to rename ticket:', err);
      setLocalTitle(ticket.title);
    } finally {
      setSavingTitle(false);
      setEditingTitle(false);
    }
  };

  // The list feeds the category picker only; without it the badge shows the ticket's own
  // category, so a role that cannot change it is not refused a request (staging 2026-10-19).
  // Changing it also needs the list: support manages tickets but may not read categories, so its
  // picker sat on "Select…" over the ticket's own category, and the list was refused (2026-10-20).
  const showCategoryPicker = hasManageTickets && canViewCategories && !ticket.externalId;
  useEffect(() => {
    if (!showCategoryPicker) return;
    categoryService
      .getAll()
      .then((res) => {
        if (res.data) setCategories(res.data);
      })
      .catch((err) => {
        logger.error('Failed to load categories:', err);
      });
  }, [showCategoryPicker]);

  const handleFieldUpdate = async (field: string, value: string) => {
    try {
      await ticketService.update(ticket.id, ticketFieldPatch(field, value));
      await onRefresh?.();
    } catch (err) {
      logger.error('Failed to update ticket field:', err);
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

  const canEdit = hasManageTickets && !ticket.externalId;
  const ticketDone = ticket.status === 'resolved' || ticket.status === 'closed';
  const descriptionHtml = DOMPurify.sanitize(translatedDescription ?? ticket.description ?? '', {
    ALLOWED_TAGS: [
      'p',
      'br',
      'b',
      'i',
      'u',
      'strong',
      'em',
      'a',
      'ul',
      'ol',
      'li',
      'blockquote',
      'pre',
      'code',
      'h1',
      'h2',
      'h3',
      'h4',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    ALLOWED_URI_REGEXP: /^https?:/i,
  });
  const longDescription = plainText(ticket.description ?? '').length > 260;

  const sidebar = (
    <>
      <section className="grid gap-3 px-[18px] py-4 border-b border-border/60">
        {sectionTitle('Properties')}
        <div className="grid grid-cols-2 gap-x-3.5 gap-y-3">
          {field(
            'Status',
            canEdit ? (
              <span className="flex gap-1.5 items-center">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[localStatus]}`}
                  aria-hidden
                />
                <Select
                  variant="value"
                  value={localStatus}
                  onChange={(val) => {
                    setLocalStatus(val as TicketStatus);
                    void handleFieldUpdate('status', val);
                  }}
                  // Only offer transitions the backend allows from the current status
                  // (mirrored via @/lib/ticketStatus) so the dropdown can't surface a move
                  // that 422s (audit HIGH, Wave1:134).
                  options={allowedStatusOptions(localStatus).map((status) => ({
                    value: status,
                    label: STATUS_LABELS[status],
                  }))}
                  aria-label="Status"
                />
              </span>
            ) : (
              <StatusDot status={localStatus} />
            )
          )}
          {field(
            'Priority',
            canEdit ? (
              <Select
                variant="value"
                value={localPriority}
                onChange={(val) => {
                  setLocalPriority(val as TicketPriority);
                  void handleFieldUpdate('priority', val);
                }}
                options={PRIORITY_OPTIONS}
                aria-label="Priority"
              />
            ) : (
              <span>{PRIORITY_OPTIONS.find((opt) => opt.value === localPriority)?.label}</span>
            )
          )}
          {field(
            'Category',
            showCategoryPicker ? (
              <Select
                variant="value"
                value={localCategoryId}
                onChange={(val) => {
                  setLocalCategoryId(val);
                  void handleFieldUpdate('categoryId', val);
                }}
                options={[
                  { value: '', label: 'None' },
                  ...categories.map((cat) => ({ value: cat.id.toString(), label: cat.name })),
                ]}
                aria-label="Category"
                searchable
              />
            ) : (
              <span className="truncate">
                {ticket.categoryName ?? (
                  <span className="text-muted-foreground/70 font-normal">None</span>
                )}
              </span>
            )
          )}
          {field(
            'Assignee',
            <AssignmentSelect
              type="ticket"
              variant="value"
              itemId={ticket.id}
              currentAssigneeId={ticket.assigneeId}
              departmentId={ticket.departmentId ?? null}
              onAssign={onRefresh}
            />
          )}
          {/* Teams off: one team, nothing to show or move to (as staging's Teams switch). */}
          {teamsEnabled &&
            field(
              'Team',
              <>
                <span className="truncate">{department?.name ?? '—'}</span>
                {hasManageTickets && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 px-[3px] text-xs font-medium text-primary hover:bg-transparent hover:underline"
                    onClick={() => setMoveDeptOpen(true)}
                  >
                    Move
                  </Button>
                )}
              </>
            )}
          {canViewLabels &&
            field(
              'Labels',
              <TicketLabelsField ticketId={ticket.id} canManage={hasManageLabels} />,
              true
            )}
        </div>
      </section>
      <section className="grid gap-3 px-[18px] py-4 border-b border-border/60">
        {sectionTitle('Details')}
        <div className="grid grid-cols-2 gap-x-3.5 gap-y-3">
          {field('From', <span className="truncate">{ticket.sender}</span>, true)}
          {field(
            'Created',
            <span className="font-mono text-xs">{shortStamp(ticket.createdAt)}</span>
          )}
          {field(
            'Updated',
            <span className="font-mono text-xs">{shortStamp(ticket.updatedAt)}</span>
          )}
        </div>
      </section>
      {(!!ticket.externalId || jiraOn) && (
        <JiraSection
          ticket={ticket}
          onPushToJira={onPushToJira}
          isPushingToJira={isPushingToJira}
        />
      )}
    </>
  );

  const moreMenu = (
    <TicketMoreMenu
      linkCopied={linkCopied}
      onCopyLink={handleCopyLink}
      onMove={hasManageTickets && teamsEnabled ? () => setMoveDeptOpen(true) : undefined}
      onPushToJira={jiraOn && !ticket.externalId ? onPushToJira : undefined}
      onDelete={onDelete}
    />
  );

  const body = (
    <div ref={rootRef} className="flex min-h-full">
      <div
        className={`grid flex-1 min-w-0 ${
          wide ? 'grid-cols-[minmax(0,1fr)_clamp(300px,31%,380px)]' : 'grid-cols-1'
        }`}
      >
        <div className="min-w-0">
          <div
            // Full width of its column: the design's final pass drops the 900 px cap.
            className={`flex flex-col gap-4 ${wide ? 'px-6 pt-5 pb-10' : 'px-4 pt-4 pb-8'}`}
          >
            {/* Header: what it is, where it came from, then the title */}
            <div className="grid gap-2">
              <div className="flex flex-wrap gap-2 items-center text-[12.5px] text-muted-foreground">
                <StatusDot status={localStatus} />
                <span>·</span>
                <span className="font-mono text-xs">#{ticket.id}</span>
                {ticket.categoryName && (
                  <>
                    <span>·</span>
                    <span>{ticket.categoryName}</span>
                  </>
                )}
                <span>·</span>
                <span>
                  opened {formatAge(ticket.createdAt)} ago from {ticket.sender}
                </span>
                {ticket.externalId && (
                  <span className="inline-flex gap-1 items-center font-mono text-[11px]">
                    <Lock className="w-3 h-3" />
                    {ticket.externalUrl ? (
                      <ExternalLink href={ticket.externalUrl}>{ticket.externalId}</ExternalLink>
                    ) : (
                      ticket.externalId
                    )}
                  </span>
                )}
              </div>
              {editingTitle ? (
                <div className="flex gap-2 items-center">
                  <Input
                    aria-label="Ticket title"
                    value={localTitle}
                    maxLength={500}
                    autoFocus
                    className="font-display text-[19px] font-semibold"
                    onChange={(event) => setLocalTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void saveTitle();
                      if (event.key === 'Escape') {
                        setLocalTitle(ticket.title);
                        setEditingTitle(false);
                      }
                    }}
                  />
                  <Button
                    onClick={() => void saveTitle()}
                    disabled={!localTitle.trim() || savingTitle}
                    isLoading={savingTitle}
                  >
                    Save
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setLocalTitle(ticket.title);
                      setEditingTitle(false);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="group/title flex gap-1.5 items-start">
                  <h2 className="flex-1 m-0 font-display text-[22px] font-semibold leading-tight tracking-[-0.01em] [text-wrap:pretty]">
                    {localTitle}
                  </h2>
                  {canEdit && (
                    <Tooltip content="Rename ticket" size="sm">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Rename ticket"
                        onClick={() => setEditingTitle(true)}
                        className="p-0 mt-px w-8 h-8 opacity-0 group-hover/title:opacity-100 focus-visible:opacity-100"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </Tooltip>
                  )}
                  {showFullPageButton && !isFullPage && !renderChrome && (
                    <Link to={`/tickets/${ticket.id}`}>
                      <Tooltip content="Open in full page" size="sm">
                        <Button variant="ghost" size="sm" aria-label="Open in full page">
                          <Maximize2 className="w-4 h-4" />
                        </Button>
                      </Tooltip>
                    </Link>
                  )}
                </div>
              )}
            </div>

            <TicketReachStrip threads={threads} ticketDone={ticketDone} />

            {/* Description */}
            <Card padding="none" className="relative rounded-[10px] shadow-none">
              <div className="flex gap-1 items-center px-3.5 pt-1.5 pr-1.5">
                <span className="font-display text-[10.5px] font-semibold tracking-[0.09em] uppercase text-muted-foreground">
                  Description
                </span>
                <span className="flex-1" />
                {canEdit && !editingDescription && (
                  <Tooltip content="Edit description" size="sm">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Edit description"
                      onClick={() => setEditingDescription(true)}
                      className="p-0 w-8 h-8"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                  </Tooltip>
                )}
                <TranslateButton
                  ticketId={ticket.id}
                  onTranslated={(content) => setTranslatedDescription(content)}
                  onCleared={() => setTranslatedDescription(null)}
                />
              </div>
              {editingDescription ? (
                <div className="grid gap-2 px-3.5 pt-1 pb-3">
                  <RichTextEditor
                    content={localDescription}
                    onChange={setLocalDescription}
                    placeholder="Enter ticket description..."
                    minHeight="120px"
                  />
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      onClick={() => {
                        void handleFieldUpdate('description', localDescription);
                        setEditingDescription(false);
                      }}
                    >
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setLocalDescription(ticket.description ?? '');
                        setEditingDescription(false);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {descriptionHtml ? (
                    <div
                      className={`px-3.5 pt-1 pb-3 max-w-none break-words [overflow-wrap:anywhere] [&_pre]:whitespace-pre-wrap prose prose-sm text-[13.5px] leading-relaxed text-foreground ${
                        longDescription && !descriptionOpen
                          ? 'max-h-[84px] overflow-hidden [mask-image:linear-gradient(#000_55%,transparent)]'
                          : ''
                      }`}
                      dangerouslySetInnerHTML={{ __html: descriptionHtml }}
                    />
                  ) : (
                    <p className="px-3.5 pt-1 pb-3 m-0 text-[13.5px] text-muted-foreground/70">
                      No description.
                    </p>
                  )}
                  {longDescription && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto px-3.5 pt-0 pb-2.5 text-[12.5px] font-medium text-primary hover:bg-transparent hover:underline"
                      onClick={() => setDescriptionOpen((open) => !open)}
                    >
                      {descriptionOpen ? 'Show less' : 'Show more'}
                    </Button>
                  )}
                </>
              )}
            </Card>

            <TicketPanelTabs
              ticketId={ticket.id}
              hasJiraLink={!!ticket.externalId}
              linkedMessages={linkedMessages}
              loadingMessages={loadingMessages}
              ticketStatus={ticket.status}
              onThreadsChange={setThreads}
              details={wide ? undefined : sidebar}
            />
          </div>
        </div>
        {wide && (
          <aside aria-label="Ticket properties" className="border-l border-border bg-card">
            <div className="sticky top-0">{sidebar}</div>
          </aside>
        )}
      </div>

      <MoveDepartmentDialog
        isOpen={moveDeptOpen}
        onClose={() => setMoveDeptOpen(false)}
        ticketId={ticket.id}
        currentDepartmentId={ticket.departmentId ?? null}
        currentAssigneeId={ticket.assigneeId}
        currentAssigneeName={ticket.assigneeName}
        onMoved={onRefresh}
      />
    </div>
  );

  return <>{renderChrome ? renderChrome(moreMenu, body) : body}</>;
};
