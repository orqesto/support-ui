// MessageDetailHeader is over the 650-line cap — same pattern as MessagesPage.
// Adding handleCreateLabel for inline label creation pushed it over by ~20
// lines. Splitting the meta strip out of this header is the natural follow-up
// refactor (see task #26 area work too).
/* eslint-disable max-lines */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  RefreshCw,
  X,
  Trash2,
  LinkIcon,
  AlertTriangle,
  Target,
  ShieldAlert,
  Maximize2,
  Sparkles,
  MessageSquare,
  Mail,
  MailOpen,
  MoreHorizontal,
  History as HistoryIcon,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { ContactProfilePanel } from '@/components/contacts/ContactProfilePanel';
import { usePermissions } from '@/hooks/usePermissions';
import { useDepartments } from '@/hooks/useDepartments';
import { useAiConfigured } from '@/hooks/useAiConfigured';
import { messageService } from '@/services/message.service';
import { categoryService } from '@/services/category.service';
import { labelService, type Label } from '@/services/settings.service';
import {
  getStatusBadge,
  deriveWorkflowStatus,
  WORKFLOW_STATUS_META,
  hashNameToLabelColor,
  type WorkflowStatus,
} from './inboxCardHelpers';
import { subscribeToEvent, unsubscribeFromEvent } from '@/lib/socketManager';
import { formatConvId, getConvUrlId, getSpamCheck } from '@/lib/messageHelpers';
import { useCurrentOrgCode } from '@/hooks/useCurrentOrgCode';
import type { Message, Category, TicketPriority, ThreadStatus } from '@/types';
import { Permission } from '@/types/roles';
import { logger } from '@/lib/logger';
import { toast } from '@/lib/toast';
import { useAssignToMe } from './useAssignToMe';
import { ResolveSplitButton } from './ResolveSplitButton';
import type { ResolveMode } from './resolveMode';
import { isAiNotConfiguredError, AI_NOT_CONFIGURED_MESSAGE } from '@/lib/errorMessages';
import {
  LABEL,
  CHIP_BASE,
  PRIORITY_OPTIONS,
  CHANNEL_ICONS,
  getInitials,
  fmtMin,
  type InboxBadge,
} from './messageDetailConstants';
import { HeaderMetaStrip } from './HeaderMetaStrip';
import { ReceivedAtAddresses } from './ReceivedAtAddresses';

// ─── Props ────────────────────────────────────────────────────────────────────

export type MessageDetailHeaderProps = {
  message: Message;
  onClose?: () => void;
  showFullPageButton: boolean;
  isFullPage: boolean;
  threadCount: number;
  onRefresh?: () => void;
  onDelete?: () => void;
  onApprove?: () => void;
  onClassify?: (
    action: 'approve' | 'mark_suspicious' | 'move_to_spam' | 'confirm_spam',
    createDetectionRule?: boolean,
    trainSpamFilter?: boolean,
    /** move_to_spam only: the agent's own decision — bin AND record it as confirmed spam. */
    confirm?: boolean
  ) => Promise<void>;
  /**
   * Optimistically move the board card to a kanban column right after a manual
   * status change (park / resolve / reopen), so the acting agent sees it move
   * instantly instead of waiting for the onRefresh refetch. No-op on the
   * standalone detail page (no board).
   */
  onOptimisticMove?: (columnId: string) => void;
  /**
   * Bumped by the parent whenever a contact label changes (from the CUSTOMER
   * tab or this header's own contact drawer). The message-label list is a
   * UNION that includes inherited contact labels, so it must refetch when they
   * change — message.id alone doesn't change on a label edit.
   */
  labelsRefreshKey?: number;
  /** Called after a contact change that also shows on cards + this header (labels). */
  onContactChanged?: () => void;
  /** Show the per-user read/unread toggle (triage queues only). */
  showReadToggle?: boolean;
  /** Current per-user read state (true = read). */
  isRead?: boolean;
  /** Toggle the per-user read/unread state. */
  onToggleRead?: () => void;
  /**
   * The resolve decision, now in the header beside status and SLA — "status and SLA are what
   * you judge before pressing Resolve". Null/absent renders no button (see resolveMode.ts).
   */
  resolveMode?: ResolveMode;
  resolving?: boolean;
  /** Opens the same confirm dialog the old footer's "Resolve (no KB)" did. */
  onResolve?: () => void;
  onResolveToKb?: () => void;
  onNotCustomerWork?: () => void;
  /** Enables "Assign to me"; hidden when the conversation is already this user's. */
  currentUserId?: number | null;
  /**
   * Full page (v3): the Dept / Assigned / Category / Labels block renders into this node — the
   * right sidebar — as stacked rows, instead of as the inline meta row under the chips. Portal,
   * so its state and handlers stay here with the rest of the header's.
   */
  metaTarget?: HTMLElement | null; // undefined = inline; null = sidebar not mounted yet
};

// Manual BE status → kanban column id, so the acting agent's card moves instantly
// on a header status change. Module-scoped (stable identity) so it needn't be a
// hook dependency. Mirrors kanbanColumns.ts (park→on_hold, terminal→resolved).
const BE_STATUS_TO_COLUMN: Partial<Record<ThreadStatus, string>> = {
  pending: 'on_hold', // park
  resolved: 'resolved',
  closed: 'resolved',
  open: 'open', // reopen / un-hold
};

// ─── Component ────────────────────────────────────────────────────────────────

// v3 header icon action: 30px target, 15px glyph; the tooltip carries the name (and key).
const ICON_BTN =
  'relative inline-grid place-items-center w-[30px] h-[30px] rounded-[7px] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors';

export function MessageDetailHeader({
  message,
  onClose,
  showFullPageButton,
  isFullPage,
  threadCount,
  onRefresh,
  labelsRefreshKey,
  onContactChanged,
  onDelete,
  onApprove,
  onClassify: onClassify,
  onOptimisticMove,
  showReadToggle,
  isRead,
  onToggleRead,
  resolveMode = null,
  resolving = false,
  onResolve,
  onResolveToKb,
  onNotCustomerWork,
  currentUserId = null,
  metaTarget,
}: MessageDetailHeaderProps) {
  const { hasPermission } = usePermissions();
  const hasManageLabels = hasPermission(Permission.MANAGE_LABELS);
  const { aiConfigured } = useAiConfigured();
  const orgCode = useCurrentOrgCode();
  const { data: allDepts = [] } = useDepartments();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [moreOpen, setMoreOpen] = useState(false);
  // Sender name → opens the contact profile drawer (same overlay as the
  // Contacts page). Resolved by the requester's email; sender may be "Name <email>".
  const [profileEmail, setProfileEmail] = useState<string | null>(null);
  const senderEmail = message.sender?.match(/<(.+?)>/)?.[1] ?? message.sender ?? '';
  // "Marta Kowalczyk <marta@…>" → the name bold, the address beside it (v3). A bare address has
  // no name part and is shown once, as the name.
  const senderName = message.sender?.includes('<')
    ? message.sender.slice(0, message.sender.indexOf('<')).trim().replace(/^"|"$/g, '')
    : '';
  const [routingTo, setRoutingTo] = useState<number | null>(null);
  // Tracks whether the in-flight near-miss route is the "+ rule" (learn) variant,
  // so only the clicked button shows its busy label while both are disabled.
  const [routingLearn, setRoutingLearn] = useState(false);
  const [showLabelPicker, setShowLabelPicker] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [updatingPriority, setUpdatingPriority] = useState(false);
  const [updatingCategory, setUpdatingCategory] = useState(false);
  const [messageLabels, setMessageLabels] = useState<Label[]>([]);
  const [allLabels, setAllLabels] = useState<Label[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [linkCopied, setLinkCopied] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [checkingContradiction, setCheckingContradiction] = useState(false);
  const [togglingLead, setTogglingLead] = useState(false);
  const [linkedTicketStatus, setLinkedTicketStatus] = useState<string | null>(null);
  // Async re-analysis kicked off by the tracking-page customer-reply path. The
  // BE flips metadata.aiReanalysisInFlight to true on enqueue and emits a WS
  // `conversation:ai_reanalysis` event (state: 'pending' → 'complete'/'failed').
  // Initial value comes from the fetched message so a page reload mid-job still
  // shows the badge until the WS event lands.
  const [aiReanalysisInFlight, setAiReanalysisInFlight] = useState<boolean>(
    () => !!(message.metadata as Record<string, unknown> | undefined)?.aiReanalysisInFlight
  );

  useEffect(() => {
    categoryService
      .getAll()
      .then((result) => {
        if (result?.success && result.data) setCategories(result.data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    Promise.all([labelService.getMessageLabels(message.id), labelService.getLabels()])
      .then(([ml, al]) => {
        setMessageLabels(ml);
        setAllLabels(al);
      })
      .catch(() => {});
  }, [message.id, labelsRefreshKey]);

  useEffect(() => {
    if (!showLabelPicker) return;
    const handler = (event: MouseEvent) => {
      const target = event.target as Node;
      if (target && !document.querySelector('[data-label-picker]')?.contains(target))
        setShowLabelPicker(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showLabelPicker]);

  const [linkedTicketId, setLinkedTicketId] = useState<number | null>(null);

  useEffect(() => {
    setLinkedTicketId(null);
    setLinkedTicketStatus(null);
    messageService
      .getLinkedTicket(message.id)
      .then((res) => {
        if (res?.data) {
          setLinkedTicketId(res.data.id);
          setLinkedTicketStatus(res.data.status);
        }
      })
      .catch(() => {});
  }, [message.id]);

  useEffect(() => {
    if (!linkedTicketId) return;
    const handler = (data: unknown) => {
      const ev = data as { ticketId: number; status?: string };
      if (ev.ticketId === linkedTicketId && ev.status) setLinkedTicketStatus(ev.status);
    };
    subscribeToEvent('ticket:updated', handler);
    return () => unsubscribeFromEvent('ticket:updated', handler);
  }, [linkedTicketId]);

  // Sync the in-flight badge from the message prop ONLY on conv change. We used
  // to also depend on `message.metadata` so navigating away+back would re-read
  // the latest value, but that introduced a race: WS 'pending' sets local
  // state=true; parent re-renders (new metadata object reference, same content
  // because the BE flag hadn't surfaced yet); effect overwrites local state
  // back to false. Now we only re-init on actual conv switch — the WS event
  // owns the local state otherwise.
  useEffect(() => {
    setAiReanalysisInFlight(
      !!(message.metadata as Record<string, unknown> | undefined)?.aiReanalysisInFlight
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message.id]);

  // Stash onRefresh in a ref so the WS subscription effect doesn't re-register
  // every time the parent passes a fresh callback identity (common when the
  // parent doesn't useCallback).
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  // Subscribe to the org-scoped `conversation:ai_reanalysis` WS event so the
  // badge flips live during the worker's run. Emitted by both the trigger
  // (`state: 'pending'`) and the processor (`state: 'complete' | 'failed'`).
  // On terminal states, refresh the message so the new metadata.analysis lands.
  useEffect(() => {
    const handler = (data: unknown) => {
      const ev = data as {
        conversationId?: number;
        state?: 'pending' | 'complete' | 'failed';
      };
      if (ev.conversationId !== message.id) return;
      if (ev.state === 'pending') {
        setAiReanalysisInFlight(true);
        return;
      }
      if (ev.state === 'complete' || ev.state === 'failed') {
        setAiReanalysisInFlight(false);
        onRefreshRef.current?.();
      }
    };
    subscribeToEvent('conversation:ai_reanalysis', handler);
    return () => unsubscribeFromEvent('conversation:ai_reanalysis', handler);
  }, [message.id]);

  // ── Computed ──────────────────────────────────────────────────────────────

  const spamCheck = getSpamCheck(message);
  const isFiltered = message.status === 'filtered';
  const isSuspicious =
    !isFiltered &&
    (message.metadata?.spamCheck as Record<string, unknown> | undefined)?.category === 'suspicious';
  const isActive =
    message.status !== 'resolved' && !isFiltered && !isSuspicious && message.status !== 'closed';

  // "Assign to me" beside the decisions it usually precedes (useAssignToMe.ts). Offered only
  // while there IS a decision to make — assigning a resolved or binned thread is not the job.
  const {
    canAssign,
    assigning: assigningMe,
    assignToMe,
  } = useAssignToMe({
    messageId: message.id,
    assigneeId: message.assigneeId,
    currentUserId,
    onAssigned: onRefresh,
  });
  const canAssignToMe = canAssign && resolveMode !== null;

  // Esc closes the open popover (ACTIONS menu or label picker) and only it — their roles keep
  // the rail's own Esc out (detailShortcuts.ts dialogIsOpen). Listened on the document, so it
  // also works from the label search box, where the rail's shortcuts are off.
  useEffect(() => {
    if (!moreOpen && !showLabelPicker) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMoreOpen(false);
      setShowLabelPicker(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [moreOpen, showLabelPicker]);
  // System-set statuses have no dropdown entry — map to nearest user-facing equivalent for display
  // The current work status is DERIVED (canonical), not the raw enum.
  const currentWorkflowStatus: WorkflowStatus = deriveWorkflowStatus(message) ?? 'open';

  const slaInfo = useMemo(() => {
    if (!message.slaResponseMinutes) return null;
    const target = message.slaResponseMinutes;
    const startTime =
      typeof (message.metadata as Record<string, unknown>)?.receivedAt === 'string'
        ? new Date((message.metadata as Record<string, unknown>).receivedAt as string)
        : new Date(message.createdAt);
    if (message.firstResponseAt) {
      const elapsed = Math.round(
        (new Date(message.firstResponseAt).getTime() - startTime.getTime()) / 60000
      );
      const breached = message.slaResponseBreached === true || elapsed > target;
      return {
        elapsed,
        target,
        breached,
        atRisk: false,
        done: true,
        barColor: breached ? 'bg-destructive' : 'bg-success',
        colorClasses: breached
          ? 'text-destructive border-destructive-line bg-destructive-muted'
          : 'text-success border-success-line bg-success-muted',
      };
    }
    const elapsed = Math.floor((Date.now() - startTime.getTime()) / 60000);
    const breached = message.slaResponseBreached === true || elapsed > target;
    const atRisk = !breached && elapsed > target * 0.8;
    return {
      elapsed,
      target,
      breached,
      atRisk,
      done: false,
      barColor: breached ? 'bg-destructive' : atRisk ? 'bg-warning' : 'bg-success',
      colorClasses: breached
        ? 'text-destructive border-destructive-line bg-destructive-muted'
        : atRisk
          ? 'text-warning border-warning-line bg-warning-muted'
          : 'text-muted-foreground border-border bg-muted',
    };
  }, [
    message.slaResponseMinutes,
    message.firstResponseAt,
    message.slaResponseBreached,
    message.createdAt,
    message.metadata,
  ]);

  const inboxBadge: InboxBadge | null = (() => {
    if (spamCheck?.isSpam === true || isFiltered)
      return {
        label: 'SPAM',
        icon: <ShieldAlert className="w-2.5 h-2.5" />,
        cls: 'text-destructive bg-destructive-muted border-destructive-line',
      };
    if (isSuspicious)
      return {
        label: 'SUSPICIOUS',
        icon: <AlertTriangle className="w-2.5 h-2.5" />,
        cls: 'text-warning bg-warning-muted border-warning-line',
      };
    // Customer just followed up via the tracking page and the BE is re-running
    // analysis on the fresh thread. Shows until the processor emits 'complete'
    // (≤ a few seconds under the 10/min limiter) so agents see why suggestions
    // are about to shift instead of having stale ones briefly contradict the
    // new reply.
    if (aiReanalysisInFlight)
      return {
        label: 'RE-ANALYZING',
        icon: <Sparkles className="w-2.5 h-2.5 animate-pulse" />,
        cls: 'text-ai border-ai-line bg-ai-muted',
      };
    // The WORK status (Open/In Progress/Pending/On-hold/Resolved) is shown by the
    // status SELECT next to this badge — don't duplicate it here. This badge only
    // surfaces Queue-axis overlays the select doesn't: spam/suspicious/re-analyzing
    // (above) and "Not Analysed" (a brand-new inbound with no AI analysis yet).
    const wf = getStatusBadge(message);
    if (!wf) return null; // filtered/needs_routing — Queue axis
    const hasAnalysis = !!(message.metadata as Record<string, unknown> | undefined)?.analysis;
    if (wf.label === 'Open' && !hasAnalysis)
      return {
        label: 'NOT ANALYSED',
        icon: null,
        cls: 'text-muted-foreground border-border bg-muted/60',
      };
    return null; // plain work status → shown by the select, not duplicated here
  })();

  // Header status control: shows the current (possibly automatic) work status and
  // offers only the MANUAL actions. Automatic statuses (open/in_progress/pending)
  // appear disabled — they're derived from replies, not settable. 'On-hold' and
  // 'Resolved' are always selectable; 'Open' is selectable only to return a parked
  // or resolved conversation to the live flow (reopen / un-hold).
  // Only the actionable transitions from the current state (keeps the menu clean —
  // the automatic statuses aren't shown as greyed dead options). The current status
  // is included once, disabled, so the chip displays it.
  const actionableStatuses: WorkflowStatus[] =
    currentWorkflowStatus === 'resolved'
      ? ['open'] // reopen
      : currentWorkflowStatus === 'on_hold'
        ? ['open', 'resolved'] // take off hold · resolve
        : ['on_hold', 'resolved']; // active (open/in_progress/pending): park · resolve
  const menuLabelFor = (ws: WorkflowStatus): string =>
    ws === 'open'
      ? currentWorkflowStatus === 'resolved'
        ? 'Reopen'
        : 'Take off hold'
      : WORKFLOW_STATUS_META[ws].label;
  const statusDisplayOptions = [
    {
      value: currentWorkflowStatus,
      label: WORKFLOW_STATUS_META[currentWorkflowStatus].label,
      menuLabel: WORKFLOW_STATUS_META[currentWorkflowStatus].label,
      chipClassName: WORKFLOW_STATUS_META[currentWorkflowStatus].className,
      isDisabled: true,
    },
    ...actionableStatuses
      .filter((ws) => ws !== currentWorkflowStatus)
      .map((ws) => ({
        value: ws,
        label: WORKFLOW_STATUS_META[ws].label,
        menuLabel: menuLabelFor(ws),
        chipClassName: WORKFLOW_STATUS_META[ws].className,
        isDisabled: false,
      })),
  ];

  // Map a chosen work status → the BE manual-status action. Automatic statuses
  // are disabled in the select, so only these three ever fire.
  const workflowToBeStatus: Partial<Record<WorkflowStatus, ThreadStatus>> = {
    on_hold: 'pending', // park
    resolved: 'resolved',
    open: 'open', // reopen / un-hold
  };

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSetStatus = useCallback(
    async (status: ThreadStatus) => {
      try {
        setUpdatingStatus(true);
        await messageService.setStatus(message.id, status);
        // Move the board card optimistically before the heavier onRefresh reconcile.
        const column = BE_STATUS_TO_COLUMN[status];
        if (column) onOptimisticMove?.(column);
        onRefresh?.();
      } catch (err) {
        logger.error('Failed to set status:', err);
      } finally {
        setUpdatingStatus(false);
      }
    },
    [message.id, onRefresh, onOptimisticMove]
  );

  const handleSetPriority = useCallback(
    async (priority: TicketPriority) => {
      try {
        setUpdatingPriority(true);
        await messageService.setPriority(message.id, priority);
        onRefresh?.();
      } catch (err) {
        logger.error('Failed to set priority:', err);
      } finally {
        setUpdatingPriority(false);
      }
    },
    [message.id, onRefresh]
  );

  const handleSetCategory = useCallback(
    async (categoryId: number | null) => {
      try {
        setUpdatingCategory(true);
        await messageService.setCategory(message.id, categoryId);
        onRefresh?.();
      } catch (err) {
        logger.error('Failed to set category:', err);
      } finally {
        setUpdatingCategory(false);
      }
    },
    [message.id, onRefresh]
  );

  const handleToggleLead = useCallback(async () => {
    try {
      setTogglingLead(true);
      await messageService.markAsLead(message.id, !message.isLead);
      onRefresh?.();
    } catch (err) {
      logger.error('Failed to toggle lead:', err);
    } finally {
      setTogglingLead(false);
    }
  }, [message.id, message.isLead, onRefresh]);

  const handleToggleLabel = useCallback(
    async (label: Label) => {
      const assigned = messageLabels.some((lbl) => lbl.id === label.id);
      const prev = messageLabels;
      setMessageLabels(
        assigned ? messageLabels.filter((lbl) => lbl.id !== label.id) : [...messageLabels, label]
      );
      try {
        if (assigned) await labelService.removeLabelFromMessage(message.id, label.id);
        else await labelService.assignLabelToMessage(message.id, label.id);
      } catch (err) {
        logger.error('Failed to toggle label:', err);
        setMessageLabels(prev);
      }
    },
    [message.id, messageLabels]
  );

  const handleCreateLabel = useCallback(
    async (name: string) => {
      try {
        // Scope the new label to THIS message's department so it's immediately
        // applicable (and so non-admins, who can't create org-wide labels, succeed).
        // Broader multi-department scoping is done from Label settings.
        const created = await labelService.createLabel({
          name,
          color: hashNameToLabelColor(name),
          departmentIds: typeof message.departmentId === 'number' ? [message.departmentId] : [],
        });
        setAllLabels((prev) => [created, ...prev]);
        // Auto-assign the newly-created label so the user doesn't need to click it
        // again. We bypass handleToggleLabel here because the optimistic state
        // hasn't been told about `created` yet — assign directly.
        setMessageLabels((prev) => [...prev, created]);
        try {
          await labelService.assignLabelToMessage(message.id, created.id);
        } catch (assignErr) {
          logger.error('Failed to assign newly-created label:', assignErr);
          setMessageLabels((prev) => prev.filter((lbl) => lbl.id !== created.id));
        }
        setShowLabelPicker(false);
      } catch (err) {
        logger.error('Failed to create label:', err);
      }
    },
    [message.id, message.departmentId]
  );

  const handleCopyLink = useCallback(() => {
    const url = `${window.location.origin}/messages?id=${getConvUrlId(message, orgCode)}`;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      })
      .catch((err) => logger.error('Failed to copy link:', err));
  }, [message, orgCode]);

  const handleCheckContradiction = useCallback(async () => {
    try {
      setCheckingContradiction(true);
      await messageService.checkContradiction(message.id);
      onRefresh?.();
    } catch (err) {
      logger.error('Failed to check contradiction:', err);
      toast.error(
        isAiNotConfiguredError(err)
          ? AI_NOT_CONFIGURED_MESSAGE
          : err instanceof Error
            ? err.message
            : 'Failed to check for contradictions.'
      );
    } finally {
      setCheckingContradiction(false);
    }
  }, [message.id, onRefresh]);

  const handleManualRoute = useCallback(
    // learn=true also mints a routing rule (via the guarded materializer) so
    // similar future emails auto-route here; default false = one-off move.
    async (deptId: number, learn = false) => {
      try {
        setRoutingTo(deptId);
        setRoutingLearn(learn);
        await messageService.manualRoute(message.id, deptId, learn);
        // Left the needs_routing queue — refresh the sidebar badge immediately.
        void queryClient.invalidateQueries({ queryKey: ['needs-routing-count'] });
        onRefresh?.();
      } catch (err) {
        logger.error('Failed to manually route:', err);
      } finally {
        setRoutingTo(null);
        setRoutingLearn(false);
      }
    },
    [message.id, onRefresh, queryClient]
  );

  const handleReanalyze = useCallback(async () => {
    try {
      setReanalyzing(true);
      await messageService.reanalyze(message.id);
      onRefresh?.();
    } catch (err) {
      logger.error('Failed to reanalyze:', err);
    } finally {
      setReanalyzing(false);
    }
  }, [message.id, onRefresh]);

  const moreMenuItems = [
    isActive &&
      onApprove && {
        label: message.isLead ? 'Create Lead Ticket' : 'Create Ticket',
        icon: <MessageSquare className="w-3 h-3" />,
        action: () => {
          onApprove();
          setMoreOpen(false);
        },
      },
    // Was the "History" link beside the sender; v3 has no room for it there, and dropping it
    // would remove the only path from a message to the customer's other conversations.
    {
      label: 'Conversation history',
      icon: <HistoryIcon className="w-3 h-3" />,
      action: () => {
        navigate(`/messages?mode=contacts&sender=${encodeURIComponent(message.sender)}`);
        setMoreOpen(false);
      },
    },
    {
      label: reanalyzing ? 'Reanalysing…' : 'Reanalyse',
      icon: <RefreshCw className={`w-3 h-3 ${reanalyzing ? 'animate-spin' : ''}`} />,
      action: () => {
        void handleReanalyze();
        setMoreOpen(false);
      },
    },
    message.externalThreadId && {
      label: checkingContradiction ? 'Checking…' : 'Check Contradiction',
      icon: <AlertTriangle className="w-3 h-3" />,
      disabled: !aiConfigured,
      tooltip: aiConfigured
        ? undefined
        : 'Contradiction check needs an AI provider — configure one in Settings.',
      action: () => {
        void handleCheckContradiction();
        setMoreOpen(false);
      },
    },
    {
      label: togglingLead ? 'Updating…' : message.isLead ? 'Unmark as Lead' : 'Mark as Lead',
      icon: <Target className="w-3 h-3" />,
      action: () => {
        void handleToggleLead();
        setMoreOpen(false);
      },
    },
    isActive &&
      message.isLead && {
        label: 'Not a Lead — Close',
        icon: <X className="w-3 h-3" />,
        action: () => {
          void messageService
            .markAsLead(message.id, false)
            .then(() => messageService.close(message.id))
            .then(() => {
              onRefresh?.();
            });
          setMoreOpen(false);
        },
      },
    isActive &&
      onClassify && {
        label: 'Mark as Suspicious',
        icon: <ShieldAlert className="w-3 h-3" />,
        action: () => {
          void onClassify('mark_suspicious');
          setMoreOpen(false);
        },
      },
    // No "Move to Spam" here (owner, 2026-09-22): the caret's "Resolve & move to spam" is the
    // one agent path, and it records CONFIRMED spam.
    onDelete && {
      label: 'Delete Message',
      icon: <Trash2 className="w-3 h-3" />,
      action: () => {
        onDelete();
        setMoreOpen(false);
      },
      danger: true,
    },
  ].filter(Boolean) as {
    label: string;
    icon: React.ReactNode;
    action: () => void;
    danger?: boolean;
    disabled?: boolean;
    tooltip?: string;
  }[];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex-shrink-0 border-b border-border bg-card">
      {/* Top row (v3): identity line left, 30px icon actions right — each with a tooltip that
          names its key where one exists. The More menu lives here now ("…", was ACTIONS). */}
      <div className="flex items-center gap-[5px] px-3.5 pt-2.5">
        <div className="flex items-center gap-2 mr-1 min-w-0 text-muted-foreground">
          <span className="font-mono text-[10.5px]">{formatConvId(message, orgCode)}</span>
          <span className={LABEL} title={message.channel}>
            {CHANNEL_ICONS[message.channel] ?? '◌'} {message.channel}
            {threadCount > 1 && ` · ${threadCount} msgs`}
          </span>
        </div>
        <span className="flex-1" />
        {showLabelPicker && (
          <button
            type="button"
            aria-label="Close"
            className="fixed inset-0 z-30 cursor-default"
            onClick={() => setShowLabelPicker(false)}
          />
        )}
        <Tooltip content={linkCopied ? 'Link copied' : 'Copy link'} side="bottom" size="sm">
          <button
            type="button"
            onClick={handleCopyLink}
            aria-label="Copy link"
            className={ICON_BTN}
          >
            <LinkIcon className="w-[15px] h-[15px]" />
          </button>
        </Tooltip>
        {onRefresh && (
          <Tooltip content="Refresh thread" side="bottom" size="sm">
            <button
              type="button"
              onClick={onRefresh}
              aria-label="Refresh thread"
              className={ICON_BTN}
            >
              <RefreshCw className="w-[15px] h-[15px]" />
            </button>
          </Tooltip>
        )}
        {showReadToggle && onToggleRead && (
          <Tooltip content={isRead ? 'Mark as unread' : 'Mark as read'} side="bottom" size="sm">
            <button
              type="button"
              onClick={onToggleRead}
              aria-label={isRead ? 'Mark as unread' : 'Mark as read'}
              className={ICON_BTN}
            >
              {isRead ? (
                <MailOpen className="w-[15px] h-[15px]" />
              ) : (
                <Mail className="w-[15px] h-[15px]" />
              )}
            </button>
          </Tooltip>
        )}
        {showFullPageButton && !isFullPage && (
          <Tooltip content="Open full page" side="bottom" size="sm">
            <Link to={`/messages/${message.id}`} aria-label="Open full page" className={ICON_BTN}>
              <Maximize2 className="w-[15px] h-[15px]" />
            </Link>
          </Tooltip>
        )}
        <div className="relative">
          <Tooltip content="More actions" side="bottom" size="sm">
            <button
              type="button"
              onClick={() => setMoreOpen((val) => !val)}
              aria-label="More actions"
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              className={`${ICON_BTN} ${moreOpen ? 'bg-muted text-foreground' : ''}`}
            >
              <MoreHorizontal className="w-[15px] h-[15px]" />
            </button>
          </Tooltip>
          {moreOpen && (
            <>
              <button
                type="button"
                aria-label="Close"
                className="fixed inset-0 z-40 cursor-default"
                onClick={() => setMoreOpen(false)}
              />
              {/* role=menu: the detail's single-key shortcuts stand down while a menu is open,
                  so Esc closes THIS, not the rail behind it (detailShortcuts.ts dialogIsOpen). */}
              <div
                role="menu"
                className="absolute top-full right-0 mt-1 z-50 rounded-lg border border-border bg-card shadow-lg p-1 min-w-[190px]"
              >
                {moreMenuItems.map((item) => {
                  const btn = (
                    <Button
                      key={item.label}
                      variant="ghost"
                      onClick={item.action}
                      disabled={item.disabled}
                      className={`w-full flex justify-start items-center gap-2 px-2 py-1.5 h-auto rounded text-xs text-left transition-colors ${item.danger ? 'text-destructive hover:bg-destructive-muted' : 'text-foreground hover:bg-accent'} ${item.disabled ? 'opacity-40 cursor-not-allowed hover:bg-transparent' : ''}`}
                    >
                      {item.icon}
                      {item.label}
                    </Button>
                  );
                  return item.tooltip ? (
                    <Tooltip key={item.label} content={item.tooltip} side="left" size="sm">
                      <span className="block w-full">{btn}</span>
                    </Tooltip>
                  ) : (
                    btn
                  );
                })}
              </div>
            </>
          )}
        </div>
        {onClose && !isFullPage && (
          <>
            <span className="w-px h-[18px] mx-0.5 bg-border flex-none" aria-hidden />
            <Tooltip content="Close · Esc" side="bottom" size="sm">
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className={`${ICON_BTN} hover:!bg-destructive-muted hover:!text-destructive`}
              >
                <X className="w-[15px] h-[15px]" />
              </button>
            </Tooltip>
          </>
        )}
      </div>

      {/* Subject */}
      <h2 className="font-display text-[16.5px] font-semibold leading-[1.3] tracking-[-0.015em] line-clamp-2 my-1.5 px-3.5 text-foreground">
        {message.subject ?? '(no subject)'}
      </h2>

      {/* Ticket bar */}
      {linkedTicketId && message.status !== 'resolved' && message.status !== 'closed' && (
        <div className="px-4 pb-2">
          <div
            className={`flex items-center justify-between px-2 py-1 rounded border-l-2 border border-border bg-card ${linkedTicketStatus === 'in_progress' ? 'border-l-success' : 'border-l-border-strong'}`}
          >
            <span
              className={`text-[11px] font-medium ${linkedTicketStatus === 'in_progress' ? 'text-success' : 'text-foreground'}`}
            >
              ✓ Ticket #{linkedTicketId}
              {linkedTicketStatus && (
                <span className="ml-1 font-normal opacity-85">
                  · {linkedTicketStatus.replace('_', ' ')}
                </span>
              )}
            </span>
            <Link
              to={`/tickets?id=${linkedTicketId}`}
              className={`text-[11px] flex items-center gap-1 ${linkedTicketStatus === 'in_progress' ? 'text-success' : 'text-primary'} hover:underline`}
            >
              View <Maximize2 className="w-2.5 h-2.5" />
            </Link>
          </div>
        </div>
      )}

      {/* Action chip row */}
      {/* Wraps on purpose: in slide-over the chips and the decisions never fit one line, so the
          decisions group is pinned right and drops onto its own right-aligned line rather than
          breaking wherever the row runs out. */}
      <div className="flex items-center gap-[7px] flex-wrap px-3.5 pb-2.5 overflow-visible">
        {/* Identity: who wrote + which of OUR addresses they wrote to. A full-width group, so the
            state chips and the decisions always start their own line beneath it. The received-at
            line is compact (first address + "+N"); the full To/Cc/Bcc is on hover AND focus. */}
        <div className="flex basis-full flex-wrap items-center gap-x-[9px] gap-y-0.5 min-w-0">
          <div className="flex items-center gap-[7px] min-w-0 overflow-hidden">
            <div className="w-[21px] h-[21px] rounded-full bg-muted border border-border grid place-items-center font-display text-[9px] font-semibold text-muted-foreground flex-none">
              {getInitials(message.sender)}
            </div>
            {senderEmail.includes('@') ? (
              <button
                type="button"
                onClick={() => setProfileEmail(senderEmail)}
                className="group flex items-baseline gap-[7px] min-w-0 text-left"
                title="View contact profile"
              >
                {senderName && (
                  <b className="font-medium text-[12.5px] whitespace-nowrap text-foreground group-hover:text-primary group-hover:underline">
                    {senderName}
                  </b>
                )}
                <span
                  className={`truncate ${senderName ? 'text-[11.5px] text-muted-foreground' : 'text-[12.5px] font-medium text-foreground group-hover:text-primary group-hover:underline'}`}
                >
                  {senderEmail}
                </span>
              </button>
            ) : (
              <span className="text-[12.5px] font-medium truncate text-foreground">
                {message.sender}
              </span>
            )}
          </div>
          <ReceivedAtAddresses
            recipients={message.recipients}
            variant="card"
            prefix="received at"
            focusable
          />
        </div>
        <ReactSelect
          variant="chip"
          value={currentWorkflowStatus}
          options={statusDisplayOptions}
          onChange={(val) => {
            const beStatus = workflowToBeStatus[val as WorkflowStatus];
            if (beStatus) void handleSetStatus(beStatus);
          }}
          isDisabled={updatingStatus}
        />
        {slaInfo && (
          <div className={`${CHIP_BASE} ${slaInfo.colorClasses}`}>
            <span>SLA</span>
            <span className="tabular-nums">
              {fmtMin(slaInfo.elapsed)}/{fmtMin(slaInfo.target)}
            </span>
            <div className="overflow-hidden w-10 h-1 rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all ${slaInfo.barColor}`}
                style={{ width: `${Math.min(100, (slaInfo.elapsed / slaInfo.target) * 100)}%` }}
              />
            </div>
          </div>
        )}
        {message.priority && (
          <ReactSelect
            variant="chip"
            value={message.priority}
            options={PRIORITY_OPTIONS}
            onChange={(val) => void handleSetPriority(val as TicketPriority)}
            isDisabled={updatingPriority}
          />
        )}
        {inboxBadge && (
          <span className={`${CHIP_BASE} ${inboxBadge.cls}`}>
            {inboxBadge.icon}
            {inboxBadge.label}
          </span>
        )}
        {message.isLead && (
          <span className={`text-success bg-success-muted border-success-line ${CHIP_BASE}`}>
            <Target className="w-2.5 h-2.5" />
            LEAD
          </span>
        )}
        <div className="flex items-center gap-1.5 ml-auto">
          {canAssignToMe && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void assignToMe()}
              disabled={assigningMe}
              className="h-[27px] px-[11px] rounded-[7px] text-[12px] bg-card"
            >
              {assigningMe ? 'Assigning…' : 'Assign to me'}
            </Button>
          )}
          {onResolve && (
            <ResolveSplitButton
              mode={resolveMode}
              busy={resolving}
              onResolve={onResolve}
              onResolveToKb={onResolveToKb}
              onNotCustomerWork={onNotCustomerWork}
              // Owner, 2026-09-22: the agent resolving AS spam is the CONFIRMED layer; spam our
              // filters bin stays unconfirmed until a person acts. Hence confirm=true here.
              onMoveToSpam={
                isActive && onClassify
                  ? () => void onClassify('move_to_spam', undefined, undefined, true)
                  : undefined
              }
            />
          )}
        </div>
      </div>

      {/* Re-route banner — runner-up depts from the routing engine.
          Lets an agent move the conversation to a near-miss dept in one click. */}
      {(message.nearMissDepts?.length ?? 0) > 0 &&
        message.status !== 'resolved' &&
        message.status !== 'closed' && (
          <div className="px-3.5 pb-[9px]">
            <div className="flex flex-wrap items-center gap-2 px-[9px] py-1.5 rounded-lg border border-primary-line bg-primary-muted">
              <span className={`${LABEL} text-primary`}>Also matched</span>
              <span className="flex-1 min-w-[150px] text-[12px] text-muted-foreground">
                Routing also scored this for{' '}
                {message.nearMissDepts!.length === 1 ? 'another department' : 'other departments'}.
              </span>
              {message.nearMissDepts!.map((deptId) => {
                const dept = allDepts.find((entry) => entry.id === deptId);
                if (!dept) return null;
                const busy = routingTo === deptId;
                return (
                  <span key={deptId} className="inline-flex items-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleManualRoute(deptId, false)}
                      disabled={busy}
                      title={`Move this conversation to ${dept.name} (one-off, no rule)`}
                      className="h-[27px] px-[11px] rounded-l-[7px] border border-border bg-card text-[12px] font-normal text-foreground hover:border-border-strong hover:bg-card disabled:opacity-50"
                    >
                      {busy && !routingLearn ? `Moving to ${dept.name}…` : `Move to ${dept.name} →`}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleManualRoute(deptId, true)}
                      disabled={busy}
                      title={`Move to ${dept.name} AND create a routing rule so similar future emails auto-route here`}
                      className="h-[27px] px-[11px] rounded-r-[7px] border border-l-0 border-border bg-card text-[12px] font-normal text-foreground hover:border-border-strong hover:bg-card disabled:opacity-50"
                    >
                      {busy && routingLearn ? 'Adding rule…' : '+ rule'}
                    </Button>
                  </span>
                );
              })}
            </div>
          </div>
        )}

      {/* Meta strip. null = the sidebar exists but its node is not mounted yet (first paint):
          render nothing rather than inline-then-move, which jumped the layout and briefly
          showed Dept/Assigned twice. */}
      {metaTarget === null ? null : metaTarget ? (
        createPortal(
          <HeaderMetaStrip
            layout="rows"
            message={message}
            categories={categories}
            messageLabels={messageLabels}
            allLabels={allLabels}
            hasManageLabels={hasManageLabels}
            showLabelPicker={showLabelPicker}
            updatingCategory={updatingCategory}
            onAssign={onRefresh}
            onSetCategory={(id) => void handleSetCategory(id)}
            onToggleLabel={(label) => void handleToggleLabel(label)}
            onToggleLabelPicker={() => setShowLabelPicker((val) => !val)}
            onCloseLabelPicker={() => setShowLabelPicker(false)}
            onCreateLabel={hasManageLabels ? (name) => void handleCreateLabel(name) : undefined}
            onDepartmentChange={onRefresh}
          />,
          metaTarget
        )
      ) : (
        <HeaderMetaStrip
          message={message}
          categories={categories}
          messageLabels={messageLabels}
          allLabels={allLabels}
          hasManageLabels={hasManageLabels}
          showLabelPicker={showLabelPicker}
          updatingCategory={updatingCategory}
          onAssign={onRefresh}
          onSetCategory={(id) => void handleSetCategory(id)}
          onToggleLabel={(label) => void handleToggleLabel(label)}
          onToggleLabelPicker={() => setShowLabelPicker((val) => !val)}
          onCloseLabelPicker={() => setShowLabelPicker(false)}
          onCreateLabel={hasManageLabels ? (name) => void handleCreateLabel(name) : undefined}
          onDepartmentChange={onRefresh}
        />
      )}

      {profileEmail && (
        <ContactProfilePanel
          email={profileEmail}
          onClose={() => setProfileEmail(null)}
          onChanged={onContactChanged ?? onRefresh}
        />
      )}
    </div>
  );
}
