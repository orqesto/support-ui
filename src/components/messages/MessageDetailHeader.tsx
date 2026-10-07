// MessageDetailHeader is well over the 650-line cap (roughly 1,500 lines): the top row, the
// chip row with its Related popovers, the More menu and the meta strip's handlers all live here.
// Focus return (useHeaderFocusReturn) and the tickets/merges reads (useThreadTicketsState) are
// already hooks; moving the More menu and the meta-strip handlers out is the natural next split.
/* eslint-disable max-lines */
import { Fragment, useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  Ticket as TicketIcon,
  GitMerge,
  ChevronLeft,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Select } from '@/components/ui/Select';
import type { LabelsStatus } from '@/components/shared/labelPickerText';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { ContactProfilePanel } from '@/components/contacts/ContactProfilePanel';
import { usePermissions } from '@/hooks/usePermissions';
import { useDepartments } from '@/hooks/useDepartments';
import { useAiConfigured } from '@/hooks/useAiConfigured';
import { messageService } from '@/services/message.service';
import type { ManualMerge } from '@/services/conversationMerge.service';
import { categoryService } from '@/services/category.service';
import { labelService, type Label } from '@/services/settings.service';
import {
  closedStatusMeta,
  getStatusBadge,
  deriveWorkflowStatus,
  WORKFLOW_STATUS_META,
  hashNameToLabelColor,
  computeSlaInfo,
  type WorkflowStatus,
} from './inboxCardHelpers';
import { subscribeToEvent, unsubscribeFromEvent } from '@/lib/socketManager';
import { formatConvId, getConvUrlId, getSpamCheck, parseSender } from '@/lib/messageHelpers';
import { useCurrentOrgCode } from '@/hooks/useCurrentOrgCode';
import type { Message, Category, TicketPriority, ThreadStatus } from '@/types';
import { Permission } from '@/types/roles';
import { logger } from '@/lib/logger';
import { toast } from '@/lib/toast';
import { isAiNotConfiguredError, AI_NOT_CONFIGURED_MESSAGE } from '@/lib/errorMessages';
import {
  LABEL,
  CHIP_SENTENCE,
  HEADER_PRIORITY_OPTIONS,
  sentenceCase,
  CHANNEL_ICONS,
  channelName,
  getInitials,
  fmtMin,
  type InboxBadge,
  createTicketLabel,
} from './messageDetailConstants';
import { HeaderMetaStrip } from './HeaderMetaStrip';
import { ReceivedAtAddresses } from './ReceivedAtAddresses';
import { AddToTicketDialog } from './AddToTicketDialog';
import { MergedSection, MergePickerDialog } from './MergeThreads';
import { RelatedPopover, TicketsSection, owesReplySentence } from './RelatedPopover';
import { useIsPhone } from './useIsPhone';
import { useModalLayer } from '@/hooks/useModalLayer';
import { MobileSenderCard } from './MobileSenderCard';
import { MOBILE_SHEET, MOBILE_SHEET_ITEM } from './relatedStyles';
import { useHeaderFocusReturn } from './useHeaderFocusReturn';
import { asManualMerge, type MergeChange } from './useThreadMergeContext';
import { useThreadTicketsState } from './useThreadTicketsState';

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
   * Full page (v3): the Dept / Assigned / Category / Labels block renders into this node — the
   * right sidebar — as stacked rows, instead of as the inline meta row under the chips. Portal,
   * so its state and handlers stay here with the rest of the header's.
   */
  metaTarget?: HTMLElement | null; // undefined = inline; null = sidebar not mounted yet
  /**
   * What was merged into this thread, read by the host (MessageDetail's useThreadMergeContext)
   * so one open asks once. null = the backend could not say. Passed WITH `onReloadMerges`;
   * without it the header reads the list itself (any other host).
   */
  merges?: ManualMerge[] | null;
  /**
   * Re-read the host's merge list. After a merge or an unmerge from here the header calls the
   * host's `onRefresh` INSTEAD when it has one: that refresh re-reads the list already
   * (MessageDetail: it bumps the refresh key useThreadMergeContext reads), and calling both
   * sent two identical GET …/merges.
   */
  onReloadMerges?: () => void;
  /**
   * Apply a merge or an unmerge the server has just confirmed to the host's list, before the
   * re-read: a re-read that fails keeps the list, and it must not still show what was undone.
   */
  onMergeChange?: (change: MergeChange) => void;
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

// "Also matched" dismissals: per thread, for the page's lifetime. Deliberately not persisted —
// the suggestion is a routing hint, and a new session is a fair time to show it again.
const dismissedNearMiss = new Set<number>();
export const dismissNearMiss = (messageId: number) => dismissedNearMiss.add(messageId);
export const isNearMissDismissed = (messageId: number) => dismissedNearMiss.has(messageId);

/**
 * The hint's sentence, naming the departments routing also scored (v3). A department this user's
 * list does not carry is not named — it is counted in the generic wording instead.
 */
export const nearMissSentence = (names: (string | undefined)[]): string => {
  const known = names.filter((name): name is string => Boolean(name));
  if (known.length === 0) {
    return `Routing also scored this for ${names.length === 1 ? 'another department' : 'other departments'}.`;
  }
  // A department missing from this user's list is still COUNTED, so the sentence never claims
  // fewer departments than the buttons' source did.
  const unknown = names.length - known.length;
  const parts =
    unknown > 0
      ? [...known, unknown === 1 ? 'another department' : `${unknown} other departments`]
      : known;
  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(', ')} or ${parts[parts.length - 1]}`;
  return `Routing also scored this for ${list}.`;
};

// ─── Component ────────────────────────────────────────────────────────────────

/** v4 mobile `.arow .chip`: 26px on phones (M3). */
const PHONE_CHIP = 'max-sm:h-[26px]';
// v4 Related chip (ticket, merged): a sentence-case chip that opens its popover.
const REL_CHIP = `${CHIP_SENTENCE} h-[23px] ${PHONE_CHIP} px-2 border-border bg-card text-muted-foreground hover:border-border-strong hover:text-foreground hover:bg-card font-sans`;

// v3 header icon action: 30px target, 15px glyph; the tooltip carries the name (and key).
const ICON_BTN =
  'relative inline-grid place-items-center w-[30px] h-[30px] rounded-[7px] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors';
/** v4 mobile `.hrow .iconbtn`: a 44px target with a 20px glyph (M1, M9). */
const PHONE_ICON_BTN =
  'max-sm:w-11 max-sm:h-11 max-sm:rounded-xl max-sm:[&>svg]:w-5 max-sm:[&>svg]:h-5';

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
  metaTarget,
  merges: hostMerges,
  onReloadMerges,
  onMergeChange,
}: MessageDetailHeaderProps) {
  const { hasPermission } = usePermissions();
  const hasManageLabels = hasPermission(Permission.MANAGE_LABELS);
  // Add/remove a thread on a ticket, merge and unmerge: the backend requires MANAGE_TICKETS.
  const canManageTickets = hasPermission(Permission.MANAGE_TICKETS);
  // A new ticket from this thread: `POST /api/tickets` requires CREATE_TICKETS.
  const canCreateTickets = hasPermission(Permission.CREATE_TICKETS);
  // Phones get the header's icon actions (refresh, read toggle) in More (v4 mobile).
  const isPhone = useIsPhone();
  const { aiConfigured } = useAiConfigured();
  const orgCode = useCurrentOrgCode();
  const { data: allDepts = [] } = useDepartments();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  /** A new ticket from this thread — the host's approve (every host goes to the create page). */
  const createTicket = useCallback(() => {
    if (onApprove) onApprove();
    else navigate(`/tickets/create?messageId=${message.id}`);
  }, [onApprove, navigate, message.id]);

  const [moreOpen, setMoreOpen] = useState(false);
  // Phones: the More sheet is modal (scrim over the page) — Tab stays on its items and the first
  // takes focus, as in a menu. Desktop keeps the plain popover (click-outside closes it).
  const moreSheetRef = useRef<HTMLDivElement>(null);
  useModalLayer(moreSheetRef, moreOpen && isPhone, { initialFocus: 'first' });
  // Sender name → opens the contact profile drawer (same overlay as the
  // Contacts page). Resolved by the requester's email; sender may be "Name <email>".
  const [profileEmail, setProfileEmail] = useState<string | null>(null);
  // "Marta Kowalczyk <marta@…>" → the name bold, the address beside it (v3). A bare address — or
  // a name that is just the address again — has no name part and is shown once. The Customer
  // tab's parser, so the header and the tab cannot disagree.
  const parsedSender = parseSender(message.sender);
  const senderEmail = parsedSender.address;
  const senderName = parsedSender.name ?? '';
  const [routingTo, setRoutingTo] = useState<number | null>(null);
  // The "Also matched" hint, dismissed for this thread for the rest of the session (v3).
  const [nearMissDismissed, setNearMissDismissed] = useState(() => isNearMissDismissed(message.id));
  useEffect(() => setNearMissDismissed(isNearMissDismissed(message.id)), [message.id]);
  // Tracks whether the in-flight near-miss route is the "+ rule" (learn) variant,
  // so only the clicked button shows its busy label while both are disabled.
  const [routingLearn, setRoutingLearn] = useState(false);
  const [showLabelPicker, setShowLabelPicker] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [updatingPriority, setUpdatingPriority] = useState(false);
  const [updatingCategory, setUpdatingCategory] = useState(false);
  const [messageLabels, setMessageLabels] = useState<Label[]>([]);
  const [allLabels, setAllLabels] = useState<Label[]>([]);
  const [labelsStatus, setLabelsStatus] = useState<LabelsStatus>('loading');
  /** Bumped to fetch the labels again (the picker opened after a failed load). */
  const [labelsAttempt, setLabelsAttempt] = useState(0);
  /**
   * Our label writes (tick, chip ×, create): how many started and how many settled. A load's
   * answer is applied only if NO write of ours was in flight at any moment during it — its list
   * may predate a write (a removed chip came back, a created one vanished). An answer that is not
   * applied is fetched again once every write has settled, so the screen still ends on the
   * server's list (a contact edit's new labels were otherwise never shown).
   */
  const labelWrites = useRef({ started: 0, settled: 0 });
  const refetchWhenWritesSettle = useRef(false);
  const beginLabelWrite = () => {
    labelWrites.current.started += 1;
  };
  const endLabelWrite = () => {
    labelWrites.current.settled += 1;
    const { started, settled } = labelWrites.current;
    if (refetchWhenWritesSettle.current && started === settled) {
      refetchWhenWritesSettle.current = false;
      setLabelsAttempt((attempt) => attempt + 1);
    }
  };
  const [categories, setCategories] = useState<Category[]>([]);
  const [linkCopied, setLinkCopied] = useState(false);
  // "Link copied" reverts after 2 s — cleared on unmount, so it never fires into an unmounted header.
  const linkCopiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (linkCopiedTimer.current !== null) clearTimeout(linkCopiedTimer.current);
    },
    []
  );
  const [reanalyzing, setReanalyzing] = useState(false);
  const [checkingContradiction, setCheckingContradiction] = useState(false);
  const [togglingLead, setTogglingLead] = useState(false);
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
    // Only the latest request's answer lands (a refresh or a new message overtakes an old one).
    let live = true;
    const atStart = { ...labelWrites.current };
    setLabelsStatus('loading');
    Promise.all([labelService.getMessageLabels(message.id), labelService.getLabels()])
      .then(([ml, al]) => {
        if (!live) return;
        const now = labelWrites.current;
        const quiet =
          atStart.started === atStart.settled &&
          now.started === atStart.started &&
          now.settled === atStart.settled;
        if (!quiet) {
          // A write overlapped this load: its answer may predate it, so keep the lists we hold
          // and ask again once every write has settled. The picker stays usable meanwhile —
          // left on 'loading', one hung write (the client has no timeout) froze it for good.
          setLabelsStatus('ready');
          if (now.started === now.settled) setLabelsAttempt((attempt) => attempt + 1);
          else refetchWhenWritesSettle.current = true;
          return;
        }
        setMessageLabels(ml);
        setAllLabels(al);
        setLabelsStatus('ready');
      })
      .catch(() => {
        if (live) setLabelsStatus('error');
      });
    return () => {
      live = false;
    };
  }, [message.id, labelsRefreshKey, labelsAttempt]);

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

  /** Which Related popover is open under its chip (v4). */
  const [relatedOpen, setRelatedOpen] = useState<'tickets' | 'merges' | null>(null);
  const [addToTicketOpen, setAddToTicketOpen] = useState(false);
  const [mergePickerOpen, setMergePickerOpen] = useState(false);

  // Focus goes back to the chip or More that opened a popover, picker or menu (see the hook).
  const { ticketChipRef, mergedChipRef, moreButtonRef, setFocusReturn } = useHeaderFocusReturn({
    addToTicketOpen,
    mergePickerOpen,
  });
  /** Close the open Related popover, handing focus back to its chip. */
  const closeRelated = useCallback(
    (kind: 'tickets' | 'merges') => {
      setRelatedOpen(null);
      setFocusReturn(kind);
    },
    [setFocusReturn]
  );
  /** A thread switch shuts any open Related popover, without handing focus anywhere. */
  const closeAllRelated = useCallback(() => setRelatedOpen(null), []);
  const closeTicketsPopover = useCallback(() => closeRelated('tickets'), [closeRelated]);
  const closeMergesPopover = useCallback(() => closeRelated('merges'), [closeRelated]);

  const {
    tickets,
    loadTickets,
    applyTicketChange,
    ticketIds,
    merges,
    loadMerges,
    applyMergeChange,
    hostOwnsMerges,
  } = useThreadTicketsState({
    messageId: message.id,
    hostMerges,
    onReloadMerges,
    onMergeChange,
    onThreadChange: closeAllRelated,
  });
  // An older backend found out after the picker opened: close it before it posts to nowhere.
  useEffect(() => {
    if (tickets.state === 'unavailable') setAddToTicketOpen(false);
  }, [tickets.state]);
  // The same for merges: no list (another thread not read yet, or a first read that failed)
  // unmounts the merge picker below — close it, so it cannot come back by itself on the next
  // good read. Its pending focus return then runs (focus lost ⇒ the chip, else More).
  useEffect(() => {
    if (merges === null) setMergePickerOpen(false);
  }, [merges]);

  // The same headline the list chip uses: the newest ticket still open, else the newest.
  const headlineTicket =
    tickets.rows.find((row) => row.status !== 'resolved' && row.status !== 'closed') ??
    tickets.rows[0];
  const linkedTicketId = headlineTicket?.ticketId ?? tickets.legacy?.id ?? null;
  const ticketCount = tickets.rows.length || (tickets.legacy ? 1 : 0);
  /*
    Tickets this viewer cannot open still count: 1 visible + 2 hidden is "#12 +2", named "Linked
    to 3 tickets (2 in departments you cannot open)" — never "#12" alone, which reads as one.
  */
  const hiddenTicketCount = tickets.state === 'ready' ? tickets.hiddenCount : 0;
  const totalTicketCount = ticketCount + hiddenTicketCount;
  /** D2: finished tickets whose fix this customer has not been told about yet. */
  const owedTicketIds = tickets.rows
    .filter((row) => row.owesReply === true)
    .map((row) => row.ticketId);
  const owedSentence = owesReplySentence(owedTicketIds);
  // The chip shows whenever there is something to say: a ticket, tickets this viewer cannot open,
  // or a read that failed (⛔ never "on no ticket" for "could not ask").
  const showTicketChip =
    ticketCount > 0 ||
    (tickets.state === 'ready' && tickets.hiddenCount > 0) ||
    tickets.state === 'failed';
  /** The chip's own words, exactly as drawn: "#12 +1", "2 hidden", "?". */
  const ticketChipText =
    linkedTicketId === null
      ? tickets.state === 'failed'
        ? '?'
        : `${tickets.hiddenCount} hidden`
      : `#${linkedTicketId}${totalTicketCount > 1 ? ` +${totalTicketCount - 1}` : ''}`;
  /** What the chip means — the tooltip. */
  const ticketChipMeaning =
    linkedTicketId === null
      ? tickets.state === 'failed'
        ? 'Could not read this thread’s tickets'
        : `On ${tickets.hiddenCount} ${tickets.hiddenCount === 1 ? 'ticket' : 'tickets'} in departments you cannot open`
      : totalTicketCount > 1
        ? `Linked to ${totalTicketCount} tickets${
            hiddenTicketCount > 0 ? ` (${hiddenTicketCount} in departments you cannot open)` : ''
          }`
        : `Linked to ticket #${linkedTicketId}`;
  /*
    WCAG 2.5.3 label in name: the accessible name STARTS with the visible words ("#12 +1 —
    linked to 2 tickets"), so a voice-control user saying what they see reaches the chip.
  */
  const ticketChipName = [
    `${ticketChipText} — ${ticketChipMeaning.charAt(0).toLowerCase()}${ticketChipMeaning.slice(1)}`,
    owedSentence,
  ]
    .filter(Boolean)
    .join('. ');

  /**
   * After a merge or an unmerge from here: the confirmed change shown at once, then the list
   * re-read ONCE (see `onReloadMerges`).
   */
  const afterMergeChange = (change: MergeChange) => {
    applyMergeChange(change);
    if (hostOwnsMerges && onRefresh) {
      onRefresh();
      return;
    }
    loadMerges();
    onRefresh?.();
  };
  const showMergedChip = (merges?.length ?? 0) > 0;

  // A popover whose chip went away (its last ticket removed, its last merge undone) is closed —
  // not left armed to reappear the next time the chip does.
  useEffect(() => {
    if (
      (relatedOpen === 'tickets' && !showTicketChip) ||
      (relatedOpen === 'merges' && !showMergedChip)
    )
      closeRelated(relatedOpen);
  }, [relatedOpen, showTicketChip, showMergedChip, closeRelated]);

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

  // The More menu closing (an item, Esc, its scrim, More itself) hands focus back to More — or
  // to the chip a picker opened from it returns to, once that picker closes (focusReturn).
  const moreWasOpen = useRef(false);
  useEffect(() => {
    if (moreWasOpen.current && !moreOpen) setFocusReturn((current) => current ?? 'more');
    // Opening More supersedes a popover's pending return (a press on More closed it).
    else if (moreOpen) setFocusReturn(null);
    moreWasOpen.current = moreOpen;
  }, [moreOpen, setFocusReturn]);

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

  const slaInfo = useMemo(
    () => computeSlaInfo(message),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recomputed on the fields it reads, not on every new `message` object
    [
      message.slaResponseMinutes,
      message.firstResponseAt,
      message.slaResponseBreached,
      message.createdAt,
      message.metadata,
      message.status,
      message.isSpam,
    ]
  );

  const inboxBadge: InboxBadge | null = (() => {
    if (spamCheck?.isSpam === true || isFiltered)
      return {
        label: 'Spam',
        icon: <ShieldAlert className="w-2.5 h-2.5" />,
        cls: 'text-destructive bg-destructive-muted border-destructive-line',
      };
    if (isSuspicious)
      return {
        label: 'Suspicious',
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
        label: 'Reanalysing',
        icon: <Sparkles className="w-2.5 h-2.5 animate-pulse" />,
        cls: 'text-ai border-ai-line bg-ai-muted',
      };
    // The WORK status (Open/In Progress/Pending/On-hold/Resolved, or Closed / Not customer work for
    // a closed thread) is shown by the
    // status SELECT next to this badge — don't duplicate it here. This badge only
    // surfaces Queue-axis overlays the select doesn't: spam/suspicious/re-analysing
    // (above) and "Not analysed" (a brand-new inbound with no AI analysis yet).
    const wf = getStatusBadge(message);
    if (!wf) return null; // filtered/needs_routing — Queue axis
    const hasAnalysis = !!(message.metadata as Record<string, unknown> | undefined)?.analysis;
    if (wf.label === 'Open' && !hasAnalysis)
      return {
        label: 'Not analysed',
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
      : sentenceCase(WORKFLOW_STATUS_META[ws].label);
  // A closed thread is not a resolution — the same chip the list shows (`closedStatusMeta`).
  const currentStatusMeta =
    closedStatusMeta(message) ?? WORKFLOW_STATUS_META[currentWorkflowStatus];
  const statusDisplayOptions = [
    {
      value: currentWorkflowStatus,
      label: sentenceCase(currentStatusMeta.label),
      // Sentence case like the chip above it and every other row ("In progress", not "In
      // Progress" under an "In progress" chip).
      menuLabel: sentenceCase(currentStatusMeta.label),
      chipClassName: currentStatusMeta.className,
      isDisabled: true,
    },
    ...actionableStatuses
      .filter((ws) => ws !== currentWorkflowStatus)
      .map((ws) => ({
        value: ws,
        label: sentenceCase(WORKFLOW_STATUS_META[ws].label),
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
      beginLabelWrite();
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
      } finally {
        endLabelWrite();
      }
    },
    [message.id, messageLabels]
  );

  const handleCreateLabel = useCallback(
    async (name: string) => {
      beginLabelWrite();
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
      } finally {
        endLabelWrite();
      }
    },
    [message.id, message.departmentId]
  );

  /*
    `announce` (the phone More menu): the menu closes on the press, so the "Link copied" label it
    would have shown is never seen — say it in a toast instead. A FAILURE is toasted everywhere:
    on desktop the tooltip just stayed "Copy link", so a refused copy looked like nothing happened.
    ⛔ Inside the promise chain: `navigator.clipboard` is undefined outside a secure context, and
    the bare call threw past the catch.
  */
  const handleCopyLink = useCallback(
    (announce = false) => {
      const url = `${window.location.origin}/messages?id=${getConvUrlId(message, orgCode)}`;
      Promise.resolve()
        .then(() => {
          // Absent outside a secure context (plain http); say that, not "undefined".
          if (!navigator.clipboard) throw new Error('the clipboard is not available here');
          return navigator.clipboard.writeText(url);
        })
        .then(() => {
          setLinkCopied(true);
          if (linkCopiedTimer.current !== null) clearTimeout(linkCopiedTimer.current);
          linkCopiedTimer.current = setTimeout(() => {
            linkCopiedTimer.current = null;
            setLinkCopied(false);
          }, 2000);
          if (announce) toast.success('Link copied');
        })
        .catch((err: unknown) => {
          logger.error('Failed to copy link:', err);
          // The browser's reason (permission refused, page not focused) — there is no backend.
          const reason = err instanceof Error && err.message ? ` (${err.message})` : '';
          toast.error(`Could not copy the link${reason} — copy it from the address bar.`);
        });
    },
    [message, orgCode]
  );

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
    /*
      In every state — resolved, filtered, an older backend, a viewer who may create but not
      manage tickets — as the Customer tab's "New ticket" was before v4 moved tickets into the
      header. It used to show only on an ACTIVE thread, and with that button gone a resolved
      thread on no ticket had no way left to start one.
    */
    canCreateTickets && {
      label: createTicketLabel(message.isLead),
      icon: <MessageSquare className="w-3 h-3" />,
      action: () => {
        createTicket();
        setMoreOpen(false);
      },
    },
    // v4: the Related pickers, also reachable with no ticket and no merge (no chip to open).
    /*
      Only once the backend is KNOWN to have the ticket links (`ready`). While the first read is
      in flight (or failed) it may be an older backend, where the picker would post to a route
      that does not exist.
    */
    canManageTickets &&
      tickets.state === 'ready' && {
        label: 'Add to ticket…',
        icon: <TicketIcon className="w-3 h-3" />,
        action: () => {
          setMoreOpen(false);
          setRelatedOpen(null);
          setAddToTicketOpen(true);
        },
      },
    canManageTickets &&
      merges !== null && {
        label: 'Merge with another thread…',
        icon: <GitMerge className="w-3 h-3" />,
        action: () => {
          setMoreOpen(false);
          setRelatedOpen(null);
          setMergePickerOpen(true);
        },
      },
    // Phones only: the header's icon actions move here (v4 mobile hides the icons).
    isPhone &&
      onRefresh && {
        label: 'Refresh thread',
        icon: <RefreshCw className="w-3 h-3" />,
        action: () => {
          onRefresh();
          setMoreOpen(false);
        },
      },
    isPhone &&
      showReadToggle &&
      onToggleRead && {
        label: isRead ? 'Mark as unread' : 'Mark as read',
        icon: isRead ? <MailOpen className="w-3 h-3" /> : <Mail className="w-3 h-3" />,
        action: () => {
          onToggleRead();
          setMoreOpen(false);
        },
      },
    // Phones only: Copy link joins them (v4 `#morePop`) — its header icon is hidden there too.
    isPhone && {
      label: 'Copy link',
      icon: <LinkIcon className="w-3 h-3" />,
      action: () => {
        handleCopyLink(true);
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
      label: checkingContradiction ? 'Checking…' : 'Check contradiction',
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
      label: togglingLead ? 'Updating…' : message.isLead ? 'Unmark as lead' : 'Mark as lead',
      icon: <Target className="w-3 h-3" />,
      action: () => {
        void handleToggleLead();
        setMoreOpen(false);
      },
    },
    isActive &&
      message.isLead && {
        label: 'Not a lead — close',
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
        label: 'Mark as suspicious',
        icon: <ShieldAlert className="w-3 h-3" />,
        action: () => {
          void onClassify('mark_suspicious');
          setMoreOpen(false);
        },
        danger: true,
      },
    // No "Move to Spam" here (owner, 2026-09-22): the caret's "Resolve & move to spam" is the
    // one agent path, and it records CONFIRMED spam.
    onDelete && {
      label: 'Delete message',
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

  // The More menu with its scrim (a bottom sheet on a phone, portalled — see where it renders).
  const moreSheet = (
    <>
      <button
        type="button"
        aria-label="Close"
        className="fixed inset-0 z-40 cursor-default max-sm:z-[69] max-sm:bg-black/40"
        onClick={() => setMoreOpen(false)}
      />
      {/* role=menu: the detail's single-key shortcuts stand down while a menu is open,
          so Esc closes THIS, not the rail behind it (detailShortcuts.ts dialogIsOpen). */}
      <div
        ref={moreSheetRef}
        role="menu"
        data-testid="more-menu"
        className={`absolute top-full right-0 mt-1 z-50 rounded-lg border border-border bg-card shadow-lg p-1 min-w-[190px] ${MOBILE_SHEET}`}
      >
        {moreMenuItems.map((item, index) => {
          // v4 `#morePop`: a rule above the destructive group (the first danger item), so
          // "Mark as suspicious" and "Delete message" never sit flush against everyday actions.
          const separated = item.danger && index > 0 && !moreMenuItems[index - 1].danger;
          const btn = (
            <Button
              key={item.label}
              role="menuitem"
              variant="ghost"
              onClick={item.action}
              disabled={item.disabled}
              className={`w-full flex justify-start items-center gap-2 px-2 py-1.5 h-auto rounded text-xs text-left transition-colors ${MOBILE_SHEET_ITEM} ${item.danger ? 'text-destructive hover:bg-destructive-muted' : 'text-foreground hover:bg-accent'} ${item.disabled ? 'opacity-40 cursor-not-allowed hover:bg-transparent' : ''}`}
            >
              {item.icon}
              {item.label}
            </Button>
          );
          const entry = item.tooltip ? (
            <Tooltip key={item.label} content={item.tooltip} side="left" size="sm">
              <span className="block w-full">{btn}</span>
            </Tooltip>
          ) : (
            btn
          );
          return separated ? (
            <Fragment key={item.label}>
              <hr
                data-testid="more-menu-separator"
                className="my-1 border-0 border-t border-border"
              />
              {entry}
            </Fragment>
          ) : (
            entry
          );
        })}
      </div>
    </>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    // v4 mobile: `display: contents` on phones, so the rows below are children of the detail's
    // column — the top row can then stick for the whole page (a sticky element only sticks
    // inside its parent's box), and the Details card can sit between the subject and the chips.
    <div className="flex-shrink-0 border-b border-border bg-card max-sm:contents">
      {/* Top row (v3): identity line left, 30px icon actions right — each with a tooltip that
          names its key where one exists. The More menu lives here now ("…", was ACTIONS). */}
      {/* v4 mobile (M1): a 52px sticky row — Back, the id centred on two lines, More. It sticks
          under the app's own header on the full page; `--md-sticky-top` is set by MessageDetail. */}
      <div
        data-testid="detail-top-row"
        className="flex items-center gap-[5px] px-3.5 pt-2.5 max-sm:sticky max-sm:top-[var(--md-sticky-top,0px)] max-sm:z-[7] max-sm:h-[52px] max-sm:gap-0 max-sm:px-1.5 max-sm:pt-0 max-sm:bg-card max-sm:border-b max-sm:border-border"
      >
        {isPhone && onClose && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Back to inbox"
            className="flex-none w-11 h-11 rounded-xl text-foreground hover:bg-muted"
          >
            <ChevronLeft className="w-5 h-5" strokeWidth={2.2} />
          </Button>
        )}
        <div className="flex items-center gap-2 mr-1 min-w-0 text-muted-foreground max-sm:flex-1 max-sm:flex-col max-sm:gap-px max-sm:mr-0 max-sm:leading-tight">
          <span className="font-mono text-[10.5px] max-sm:text-[12px] max-sm:font-semibold max-sm:text-foreground">
            {formatConvId(message, orgCode)}
          </span>
          <span
            className={`${LABEL} max-sm:text-[10.5px] max-sm:truncate max-sm:max-w-full`}
            title={channelName(message.channel) || undefined}
          >
            {/* The channel's name ("WhatsApp", not the key) — LABEL sets it in capitals, as v4. */}
            {CHANNEL_ICONS[message.channel] ?? '◌'} {channelName(message.channel)}
            {threadCount > 1 && ` · ${threadCount} msgs`}
          </span>
        </div>
        <span className="flex-1 max-sm:hidden" />
        {showLabelPicker && (
          <button
            type="button"
            aria-label="Close"
            className="fixed inset-0 z-30 cursor-default"
            onClick={() => setShowLabelPicker(false)}
          />
        )}
        {/* Phones: Copy link / Refresh / read toggle / full page / Close live in More or the Back
            button instead (v4 mobile hides these icons). */}
        {!isPhone && (
          <Tooltip content={linkCopied ? 'Link copied' : 'Copy link'} side="bottom" size="sm">
            <button
              type="button"
              onClick={() => handleCopyLink()}
              aria-label="Copy link"
              className={ICON_BTN}
            >
              <LinkIcon className="w-[15px] h-[15px]" />
            </button>
          </Tooltip>
        )}
        {!isPhone && onRefresh && (
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
        {!isPhone && showReadToggle && onToggleRead && (
          <Tooltip
            // U does the same (detailShortcuts.ts) — it acts exactly where this toggle is shown.
            content={isRead ? 'Mark as unread · U' : 'Mark as read · U'}
            side="bottom"
            size="sm"
          >
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
        {!isPhone && showFullPageButton && !isFullPage && (
          <Tooltip content="Open full page" side="bottom" size="sm">
            <Link to={`/messages/${message.id}`} aria-label="Open full page" className={ICON_BTN}>
              <Maximize2 className="w-[15px] h-[15px]" />
            </Link>
          </Tooltip>
        )}
        <div className="relative">
          <Tooltip content="More actions" side="bottom" size="sm" quietFocus>
            <button
              ref={moreButtonRef}
              type="button"
              onClick={() => setMoreOpen((val) => !val)}
              aria-label="More actions"
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              className={`${ICON_BTN} ${PHONE_ICON_BTN} ${moreOpen ? 'bg-muted text-foreground' : ''}`}
            >
              <MoreHorizontal className="w-[15px] h-[15px]" />
            </button>
          </Tooltip>
          {moreOpen &&
            /*
              Phones: the sheet and its scrim go to <body>. Inside this sticky row they sat in its
              stacking context (z 7), under the app's fixed header (z 65) on the full page — the
              Related sheet, rendered outside the row, covers it; both sheets now behave alike.
            */
            (isPhone ? createPortal(moreSheet, document.body) : moreSheet)}
        </div>
        {!isPhone && onClose && !isFullPage && (
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
      <h2 className="font-display text-[16.5px] font-semibold leading-[1.3] tracking-[-0.015em] line-clamp-2 my-1.5 px-3.5 text-foreground max-sm:text-[17px] max-sm:leading-[1.32] max-sm:line-clamp-none max-sm:[text-wrap:pretty] max-sm:my-0 max-sm:px-4 max-sm:pt-3.5 max-sm:bg-card">
        {message.subject ?? '(no subject)'}
      </h2>

      {/* v4 mobile (M2): the sender as a collapsible card. Expanded it carries the addresses and
          the Dept / Assigned / Category / Labels rows — the SAME meta strip (and the same state
          here) the inline row and the full page's sidebar render. */}
      {isPhone && (
        <MobileSenderCard
          name={senderName}
          address={senderEmail || message.sender || ''}
          initials={getInitials(message.sender)}
          recipients={message.recipients}
        >
          <HeaderMetaStrip
            layout="card"
            message={message}
            categories={categories}
            messageLabels={messageLabels}
            allLabels={allLabels}
            labelsStatus={labelsStatus}
            onRetryLabels={() => setLabelsAttempt((attempt) => attempt + 1)}
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
        </MobileSenderCard>
      )}

      {/* Action chip row */}
      <div
        data-testid="header-chips"
        className="flex items-center gap-[7px] flex-wrap px-3.5 pb-2.5 overflow-visible max-sm:gap-1.5 max-sm:px-4 max-sm:pt-2.5 max-sm:pb-0 max-sm:bg-card"
      >
        {/* Identity: who wrote + which of OUR addresses they wrote to. A full-width group, so the
            state chips and the decisions always start their own line beneath it. The received-at
            line is compact (first address + "+N"); the full To/Cc/Bcc is on hover AND focus. */}
        {/* Phones show the sender in the Details card above instead (M2). */}
        {!isPhone && (
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
        )}
        <Select
          aria-label="Status"
          variant="chip"
          chipCase="sentence"
          value={currentWorkflowStatus}
          options={statusDisplayOptions}
          mobileSheet
          onChange={(val) => {
            const beStatus = workflowToBeStatus[val as WorkflowStatus];
            if (beStatus) void handleSetStatus(beStatus);
          }}
          isDisabled={updatingStatus}
        />
        {slaInfo?.record && (
          <Tooltip
            content={`First reply took ${fmtMin(slaInfo.elapsed)} against a ${fmtMin(slaInfo.target)} target`}
            size="sm"
          >
            <div
              className={`${CHIP_SENTENCE} ${PHONE_CHIP} ${slaInfo.colorClasses}`}
              data-testid="sla-record"
            >
              <span>SLA</span>
              <span className="tabular-nums">
                {fmtMin(slaInfo.elapsed)}/{fmtMin(slaInfo.target)}
              </span>
              <span>{slaInfo.breached ? 'missed' : 'met'}</span>
            </div>
          </Tooltip>
        )}
        {slaInfo && !slaInfo.record && (
          <div
            className={`${CHIP_SENTENCE} ${PHONE_CHIP} ${slaInfo.colorClasses}`}
            data-testid="sla-clock"
          >
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
          <Select
            aria-label="Priority"
            variant="chip"
            chipCase="sentence"
            value={message.priority}
            options={HEADER_PRIORITY_OPTIONS}
            mobileSheet
            onChange={(val) => void handleSetPriority(val as TicketPriority)}
            isDisabled={updatingPriority}
          />
        )}
        {/* v4 Related: the ticket chip — the first ticket's #id and "+N" for the rest. Opens the
            popover listing a card per ticket. Hidden when the thread is on no ticket. */}
        {showTicketChip && (
          <div className="relative">
            <Tooltip content={owedSentence ?? ticketChipMeaning} side="bottom" size="sm" quietFocus>
              <Button
                ref={ticketChipRef}
                type="button"
                variant="ghost"
                data-related-chip
                data-testid="ticket-chip"
                aria-haspopup="dialog"
                aria-expanded={relatedOpen === 'tickets'}
                aria-label={ticketChipName}
                onClick={() =>
                  relatedOpen === 'tickets' ? closeRelated('tickets') : setRelatedOpen('tickets')
                }
                className={`${REL_CHIP} ${owedSentence ? 'border-warning-line' : ''} ${relatedOpen === 'tickets' ? 'border-border-strong text-foreground' : ''}`}
              >
                <TicketIcon className="w-3 h-3" aria-hidden />
                {linkedTicketId === null ? (
                  <span>{ticketChipText}</span>
                ) : (
                  <span className="font-mono text-[11.5px]">#{linkedTicketId}</span>
                )}
                {linkedTicketId !== null && totalTicketCount > 1 && (
                  <span>+{totalTicketCount - 1}</span>
                )}
                {owedSentence && (
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-warning"
                    data-testid="owes-reply-dot"
                    aria-hidden
                  />
                )}
              </Button>
            </Tooltip>
            {relatedOpen === 'tickets' && (
              <RelatedPopover label="Tickets" onClose={closeTicketsPopover}>
                <TicketsSection
                  message={message}
                  tickets={tickets}
                  canManage={canManageTickets}
                  canCreate={canCreateTickets}
                  onRetry={loadTickets}
                  onAddToTicket={() => {
                    closeRelated('tickets');
                    setAddToTicketOpen(true);
                  }}
                  onCreateTicket={createTicket}
                  // Shown at once (the service also announces it, and the chip re-reads); the
                  // board's card chip comes from the thread list, as after an add.
                  onRemoved={({ ticketId, conversationId }) => {
                    applyTicketChange({ conversationId, removed: ticketId });
                    onRefresh?.();
                  }}
                />
              </RelatedPopover>
            )}
          </div>
        )}
        {/* v4 Related: "Merged · n" when other threads were merged into this one. */}
        {showMergedChip && merges && (
          <div className="relative">
            <Button
              ref={mergedChipRef}
              type="button"
              variant="ghost"
              data-related-chip
              data-testid="merged-chip"
              aria-haspopup="dialog"
              aria-expanded={relatedOpen === 'merges'}
              // Label in name: the visible "Merged · 1" first.
              aria-label={`Merged · ${merges.length} — ${merges.length} ${merges.length === 1 ? 'thread' : 'threads'} merged in`}
              onClick={() =>
                relatedOpen === 'merges' ? closeRelated('merges') : setRelatedOpen('merges')
              }
              className={`${REL_CHIP} ${relatedOpen === 'merges' ? 'border-border-strong text-foreground' : ''}`}
            >
              <GitMerge className="w-3 h-3" aria-hidden />
              <span>Merged · {merges.length}</span>
            </Button>
            {relatedOpen === 'merges' && (
              <RelatedPopover label="Same conversation" onClose={closeMergesPopover}>
                <MergedSection
                  message={message}
                  merges={merges}
                  canManage={canManageTickets}
                  onMerge={() => {
                    closeRelated('merges');
                    setMergePickerOpen(true);
                  }}
                  onUnmerged={(unmergedId) => afterMergeChange({ unmerged: unmergedId })}
                />
              </RelatedPopover>
            )}
          </div>
        )}
        {inboxBadge && (
          // Sentence case like every other chip in the row (v4), spelt as the More menu's
          // "Reanalyse" / "Reanalysing…" so one action is not named two ways.
          <span className={`${CHIP_SENTENCE} ${PHONE_CHIP} ${inboxBadge.cls}`}>
            {inboxBadge.icon}
            {inboxBadge.label}
          </span>
        )}
        {message.isLead && (
          <span
            className={`text-success bg-success-muted border-success-line ${CHIP_SENTENCE} ${PHONE_CHIP}`}
          >
            <Target className="w-2.5 h-2.5" />
            Lead
          </span>
        )}
      </div>

      {/* Re-route banner — runner-up depts from the routing engine.
          Lets an agent move the conversation to a near-miss dept in one click. */}
      {(message.nearMissDepts?.length ?? 0) > 0 &&
        !nearMissDismissed &&
        message.status !== 'resolved' &&
        message.status !== 'closed' && (
          <div className="px-3.5 pb-[9px] max-sm:px-4 max-sm:pt-2.5 max-sm:pb-0 max-sm:bg-card">
            <div className="flex flex-wrap items-center gap-2 px-[9px] py-1.5 rounded-lg border border-primary-line bg-primary-muted">
              <span className={`${LABEL} text-primary`}>Also matched</span>
              <span className="flex-1 min-w-[150px] text-[12px] text-muted-foreground">
                {nearMissSentence(
                  message.nearMissDepts!.map(
                    (deptId) => allDepts.find((entry) => entry.id === deptId)?.name
                  )
                )}
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
              <Tooltip content="Dismiss" side="bottom" size="sm">
                <button
                  type="button"
                  aria-label="Dismiss routing suggestion"
                  onClick={() => {
                    dismissNearMiss(message.id);
                    setNearMissDismissed(true);
                  }}
                  className={ICON_BTN}
                >
                  <X className="w-[15px] h-[15px]" />
                </button>
              </Tooltip>
            </div>
          </div>
        )}

      {/* Meta strip. null = the sidebar exists but its node is not mounted yet (first paint):
          render nothing rather than inline-then-move, which jumped the layout and briefly
          showed Dept/Assigned twice. */}
      {isPhone ? null : metaTarget === null ? null : metaTarget ? (
        createPortal(
          <HeaderMetaStrip
            layout="rows"
            message={message}
            categories={categories}
            messageLabels={messageLabels}
            allLabels={allLabels}
            labelsStatus={labelsStatus}
            onRetryLabels={() => setLabelsAttempt((attempt) => attempt + 1)}
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
          labelsStatus={labelsStatus}
          onRetryLabels={() => setLabelsAttempt((attempt) => attempt + 1)}
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

      <AddToTicketDialog
        open={addToTicketOpen}
        onOpenChange={setAddToTicketOpen}
        message={message}
        excludeTicketIds={ticketIds}
        canCreate={canCreateTickets}
        onCreateTicket={createTicket}
        isLead={message.isLead}
        onAdded={({ ticketId, alreadyOn, ticket, conversationId }) => {
          if (alreadyOn) toast.info(`This thread is already on ticket #${ticketId}.`);
          // Shown at once — a re-read that fails must not leave the thread "on no ticket". The
          // service also announces it and the chip re-reads; the board's card chip comes from
          // the thread list.
          applyTicketChange({ conversationId, added: ticket });
          onRefresh?.();
        }}
      />
      {merges !== null && (
        <MergePickerDialog
          open={mergePickerOpen}
          onOpenChange={setMergePickerOpen}
          message={message}
          onMerged={(survivor, mergedIn) => {
            // Merged away: the picker has navigated to the survivor; only the surfaces refresh.
            if (survivor.id === message.id) {
              afterMergeChange({ mergedIn: mergedIn.map(asManualMerge) });
            } else onRefresh?.();
          }}
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
