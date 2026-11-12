// MessageDetailHeader: the header's state and the order of its hooks live here; the rows render
// from messageDetailHeader/ (top row, chip row, Related chips, near-miss banner, More menu), and
// its data hooks and pure derivations sit beside them.
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ContactProfilePanel } from '@/features/contacts';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuthStore } from '@/stores/authStore';
import { useLeadsHidden } from '@/features/messages/hooks/useLeadsHidden';
import { useDepartments } from '@/hooks/useDepartments';
import { useTeamsEnabled } from '@/hooks/useTeamsEnabled';
import { useAiConfigured } from '@/hooks/useAiConfigured';
import { categoryService, TicketRef } from '@/features/tickets/shell';
import {
  deriveWorkflowStatus,
  computeResolutionInfo,
  computeSlaInfo,
  isSpamThread,
  type WorkflowStatus,
} from './inboxCardHelpers';
import { parseSender } from '@/lib/messageHelpers';
import { deriveThreadFlags } from './messageDetail/threadFlags';
import { useCurrentOrgCode } from '@/hooks/useCurrentOrgCode';
import type { Category, ThreadStatus } from '@/types';
import { Permission } from '@/types/roles';
import { toast } from '@/lib/toast';
import { useAiRefusalText } from '@/features/subscription/shell';
import { useIsWorkspaceAdmin } from '@/hooks/useIsWorkspaceAdmin';
import { getInitials } from '@/lib/initials';
import { HeaderMetaStrip } from './HeaderMetaStrip';
import { useGuardAction } from '../presence/writingGuardContext';
import { AddToTicketDialog } from './AddToTicketDialog';
import { MergePickerDialog } from './MergeThreads';
import { useIsPhone } from './useIsPhone';
import { useModalLayer } from '@/hooks/useModalLayer';
import { useNow } from '@/hooks/useNow';
import { MobileSenderCard } from './MobileSenderCard';
import { useHeaderFocusReturn } from './useHeaderFocusReturn';
import { asManualMerge, type MergeChange } from './useThreadMergeContext';
import { useThreadTicketsState } from './useThreadTicketsState';
import { useConversationMute } from '@/features/messages/hooks/useConversationMute';
import { ticketDisplayId } from '@/lib/ticketReference';
import type { MessageDetailHeaderProps } from './messageDetailHeader/types';
import { isNearMissDismissed, nearMissSentence } from './messageDetailHeader/nearMiss';
import {
  getTicketChipState,
  getInboxBadge,
  buildStatusDisplayOptions,
} from './messageDetailHeader/headerDerived';
import {
  useHeaderLabelState,
  useHeaderLabelsLoad,
  useHeaderLabelHandlers,
} from './messageDetailHeader/useHeaderLabels';
import {
  useHeaderFieldHandlers,
  useHeaderActionHandlers,
} from './messageDetailHeader/useHeaderHandlers';
import { useAiReanalysisSync, useMoreMenuDismissal } from './messageDetailHeader/useHeaderEffects';
import { buildMoreMenuItems } from './messageDetailHeader/buildMoreMenuItems';
import { MoreMenuSheet } from './messageDetailHeader/MoreMenuSheet';
import { HeaderTopRow } from './messageDetailHeader/HeaderTopRow';
import { HeaderChipRow } from './messageDetailHeader/HeaderChipRow';
import { TicketChip, MergedChip } from './messageDetailHeader/RelatedChips';
import { NearMissBanner } from './messageDetailHeader/NearMissBanner';

// ─── Props ────────────────────────────────────────────────────────────────────

export type { MessageDetailHeaderProps } from './messageDetailHeader/types';

export {
  dismissNearMiss,
  isNearMissDismissed,
  nearMissSentence,
} from './messageDetailHeader/nearMiss';

// ─── Component ────────────────────────────────────────────────────────────────

export function MessageDetailHeader({
  message,
  presence,
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
  compact = false,
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
  // Agents cannot connect a provider: with no AI they get no dead AI item (audit B3).
  const isWorkspaceAdmin = useIsWorkspaceAdmin();
  const refusalText = useAiRefusalText();
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
  const myUserId = useAuthStore((state) => state.user?.id);
  // The backend deletes my mute when the thread is resolved, closed or filtered, or assigned to me.
  const muteEndedByStatus =
    message.status === 'resolved' || message.status === 'closed' || message.status === 'filtered';
  const muteEnded =
    muteEndedByStatus || (myUserId !== undefined && message.assigneeId === myUserId);
  // A finished thread (resolved, closed, filtered) cannot be muted: the backend answers 409.
  const muteBlocked = muteEndedByStatus;
  const threadMute = useConversationMute(message.id, message.mutedByMe, {
    ended: muteEnded,
    onReconcile: onRefresh,
  });
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
  // Never "Move to <the department it is already in>". The scores are the first route's, and the
  // thread may have moved since (routed by hand out of Needs Routing, or to a runner-up); the
  // backend filters this too, but an older backend does not (demo, 2026-10-14).
  // Teams off: one team, so there is nowhere else to move a thread.
  const teamsEnabled = useTeamsEnabled();
  const nearMissDepts = (teamsEnabled ? (message.nearMissDepts ?? []) : []).filter(
    (deptId) => deptId !== message.departmentId
  );
  useEffect(() => setNearMissDismissed(isNearMissDismissed(message.id)), [message.id]);
  const [showLabelPicker, setShowLabelPicker] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  // On-hold asks why and until when first (holdDialog); the other statuses apply at once.
  const [holdOpen, setHoldOpen] = useState(false);
  const [updatingPriority, setUpdatingPriority] = useState(false);
  const [updatingCategory, setUpdatingCategory] = useState(false);
  const {
    messageLabels,
    setMessageLabels,
    allLabels,
    setAllLabels,
    labelsStatus,
    setLabelsStatus,
    labelsAttempt,
    setLabelsAttempt,
    labelWrites,
    refetchWhenWritesSettle,
    beginLabelWrite,
    endLabelWrite,
  } = useHeaderLabelState(message.id);
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
  // No existing department opted in to lead qualification ⇒ "Mark as lead" does nothing useful.
  const leadsHidden = useLeadsHidden();
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

  useHeaderLabelsLoad({
    message,
    labelsRefreshKey,
    labelsAttempt,
    labelWrites,
    refetchWhenWritesSettle,
    setLabelsStatus,
    setLabelsAttempt,
    setMessageLabels,
    setAllLabels,
  });

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
  const {
    headlineTicket,
    linkedTicketId,
    totalTicketCount,
    owedSentence,
    showTicketChip,
    ticketChipText,
    ticketChipMeaning,
    ticketChipName,
  } = getTicketChipState(tickets, orgCode);

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

  useAiReanalysisSync({ message, onRefresh, setAiReanalysisInFlight });

  // ── Computed ──────────────────────────────────────────────────────────────

  // One source of truth with the detail (threadFlags.ts): suspicious is the queue's answer (the
  // newest inbound verdict), and a spam verdict outside triage makes the thread inactive here too.
  const { isFiltered, isSuspicious, isActive } = deriveThreadFlags(message);

  useMoreMenuDismissal({
    moreOpen,
    setMoreOpen,
    showLabelPicker,
    setShowLabelPicker,
    setFocusReturn,
  });
  // System-set statuses have no dropdown entry — map to nearest user-facing equivalent for display
  // The current work status is DERIVED (canonical), not the raw enum.
  const currentWorkflowStatus: WorkflowStatus = deriveWorkflowStatus(message) ?? 'open';

  // The chips are clocks: one tick a minute keeps them moving while the thread stays on screen.
  // The tick only triggers a recompute; each one reads the current time, so a message change
  // between ticks is not judged at the last tick's (up to a minute old) time.
  const tick = useNow(60_000);
  const resolutionInfo = useMemo(
    () => computeResolutionInfo(message),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recomputed on the fields it reads
    [
      tick,
      message.slaResolutionMinutes,
      message.slaResolutionStartedAt,
      message.slaResponseMinutes,
      message.status,
      message.metadata,
      message.isSpam,
      message.spamConfirmedAt,
    ]
  );
  const slaInfo = useMemo(
    () => computeSlaInfo(message),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recomputed on the fields it reads, not on every new `message` object
    [
      tick,
      message.slaResponseMinutes,
      message.slaWaitStartedAt,
      message.firstResponseAt,
      message.actualResponseSeconds,
      message.slaResponseBreached,
      message.createdAt,
      message.metadata,
      message.status,
      message.isSpam,
      message.spamConfirmedAt,
    ]
  );

  const inboxBadge = getInboxBadge(message, {
    // The lane's answer (the newest inbound verdict), as the action strip reads it.
    isSpam: isSpamThread(message),
    isFiltered,
    isSuspicious,
    aiReanalysisInFlight,
  });

  const statusDisplayOptions = buildStatusDisplayOptions(message, currentWorkflowStatus);

  // Map a chosen work status → the BE manual-status action. Automatic statuses
  // are disabled in the select, so only these three ever fire.
  const workflowToBeStatus: Partial<Record<WorkflowStatus, ThreadStatus>> = {
    on_hold: 'pending', // park
    resolved: 'resolved',
    open: 'open', // reopen / un-hold
  };

  // ── Handlers ──────────────────────────────────────────────────────────────

  const { handleSetStatus, handleSetPriority, handleSetCategory, handleToggleLead } =
    useHeaderFieldHandlers({
      message,
      onRefresh,
      onOptimisticMove,
      setUpdatingStatus,
      setHoldOpen,
      setUpdatingPriority,
      setUpdatingCategory,
      setTogglingLead,
    });

  const { handleToggleLabel, handleCreateLabel } = useHeaderLabelHandlers({
    message,
    messageLabels,
    setMessageLabels,
    setAllLabels,
    beginLabelWrite,
    endLabelWrite,
    setShowLabelPicker,
  });

  const { handleCopyLink, handleCheckContradiction, handleManualRoute, handleReanalyze } =
    useHeaderActionHandlers({
      message,
      orgCode,
      onRefresh,
      refusalText,
      queryClient,
      setLinkCopied,
      linkCopiedTimer,
      setCheckingContradiction,
      setRoutingTo,
      setReanalyzing,
    });

  const guardAction = useGuardAction();
  const moreMenuItems = buildMoreMenuItems({
    message,
    canCreateTickets,
    canManageTickets,
    createTicket,
    setMoreOpen,
    tickets,
    merges,
    setRelatedOpen,
    setAddToTicketOpen,
    setMergePickerOpen,
    threadMute,
    muteBlocked,
    isPhone,
    onRefresh,
    showReadToggle,
    onToggleRead,
    isRead,
    handleCopyLink,
    navigate,
    reanalyzing,
    handleReanalyze,
    aiConfigured,
    isWorkspaceAdmin,
    checkingContradiction,
    handleCheckContradiction,
    leadsHidden,
    togglingLead,
    handleToggleLead,
    // deriveThreadFlags counts a resolved thread as active (the detail lets it be replied to); the
    // header's "Mark as suspicious" and "Not a lead — close" stay off a resolved thread (owner
    // 2026-11-12).
    isActive: isActive && message.status !== 'resolved',
    onClassify,
    onDelete,
    guard: guardAction,
  });

  // The More menu with its scrim (a bottom sheet on a phone, portalled — see where it renders).
  const moreSheet = (
    <MoreMenuSheet
      moreMenuItems={moreMenuItems}
      moreSheetRef={moreSheetRef}
      setMoreOpen={setMoreOpen}
    />
  );

  const nearMissText = nearMissSentence(
    nearMissDepts.map((deptId) => allDepts.find((entry) => entry.id === deptId)?.name)
  );

  // The meta strip's state and handlers, the same in all three places it renders (phone card,
  // full-page sidebar, inline row).
  const metaStripProps = {
    message,
    categories,
    messageLabels,
    allLabels,
    labelsStatus,
    onRetryLabels: () => setLabelsAttempt((attempt) => attempt + 1),
    hasManageLabels,
    showLabelPicker,
    updatingCategory,
    onAssign: onRefresh,
    onSetCategory: (id: number | null) => void handleSetCategory(id),
    onToggleLabel: (label: (typeof allLabels)[number]) => void handleToggleLabel(label),
    onToggleLabelPicker: () => setShowLabelPicker((val) => !val),
    onCloseLabelPicker: () => setShowLabelPicker(false),
    onCreateLabel: hasManageLabels ? (name: string) => void handleCreateLabel(name) : undefined,
    onDepartmentChange: onRefresh,
  };

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
      <HeaderTopRow
        message={message}
        orgCode={orgCode}
        threadCount={threadCount}
        compact={compact}
        isPhone={isPhone}
        isFullPage={isFullPage}
        showFullPageButton={showFullPageButton}
        onClose={onClose}
        onRefresh={onRefresh}
        showReadToggle={showReadToggle}
        isRead={isRead}
        onToggleRead={onToggleRead}
        showLabelPicker={showLabelPicker}
        setShowLabelPicker={setShowLabelPicker}
        linkCopied={linkCopied}
        handleCopyLink={handleCopyLink}
        moreButtonRef={moreButtonRef}
        moreOpen={moreOpen}
        setMoreOpen={setMoreOpen}
        moreSheet={moreSheet}
        presence={presence}
      />

      {/* Subject */}
      {isPhone && (
        <h2 className="font-display font-semibold tracking-[-0.015em] text-foreground max-sm:text-[17px] max-sm:leading-[1.32] max-sm:line-clamp-none max-sm:[text-wrap:pretty] max-sm:my-0 max-sm:px-4 max-sm:pt-3.5 max-sm:bg-card">
          {message.subject ?? '(no subject)'}
        </h2>
      )}

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
          <HeaderMetaStrip layout="card" {...metaStripProps} />
        </MobileSenderCard>
      )}

      {/* Action chip row */}
      <HeaderChipRow
        message={message}
        compact={compact}
        isPhone={isPhone}
        senderName={senderName}
        senderEmail={senderEmail}
        setProfileEmail={setProfileEmail}
        isFiltered={isFiltered}
        currentWorkflowStatus={currentWorkflowStatus}
        statusDisplayOptions={statusDisplayOptions}
        workflowToBeStatus={workflowToBeStatus}
        updatingStatus={updatingStatus}
        holdOpen={holdOpen}
        setHoldOpen={setHoldOpen}
        handleSetStatus={handleSetStatus}
        slaInfo={slaInfo}
        resolutionInfo={resolutionInfo}
        updatingPriority={updatingPriority}
        handleSetPriority={handleSetPriority}
        inboxBadge={inboxBadge}
        related={
          <>
            {showTicketChip && (
              <TicketChip
                message={message}
                tickets={tickets}
                ticketChipRef={ticketChipRef}
                relatedOpen={relatedOpen}
                setRelatedOpen={setRelatedOpen}
                closeRelated={closeRelated}
                closeTicketsPopover={closeTicketsPopover}
                owedSentence={owedSentence}
                ticketChipMeaning={ticketChipMeaning}
                ticketChipName={ticketChipName}
                ticketChipText={ticketChipText}
                linkedTicketId={linkedTicketId}
                headlineTicketRef={
                  linkedTicketId === null ? null : (
                    <TicketRef
                      ticket={{ id: linkedTicketId, reference: headlineTicket?.reference }}
                      className="text-[11.5px]"
                    />
                  )
                }
                totalTicketCount={totalTicketCount}
                canManageTickets={canManageTickets}
                canCreateTickets={canCreateTickets}
                loadTickets={loadTickets}
                setAddToTicketOpen={setAddToTicketOpen}
                createTicket={createTicket}
                applyTicketChange={applyTicketChange}
                onRefresh={onRefresh}
              />
            )}
            {showMergedChip && merges && (
              <MergedChip
                message={message}
                merges={merges}
                mergedChipRef={mergedChipRef}
                relatedOpen={relatedOpen}
                setRelatedOpen={setRelatedOpen}
                closeRelated={closeRelated}
                closeMergesPopover={closeMergesPopover}
                canManageTickets={canManageTickets}
                setMergePickerOpen={setMergePickerOpen}
                afterMergeChange={afterMergeChange}
              />
            )}
          </>
        }
      />

      {/* Re-route banner — runner-up depts from the routing engine.
          Lets an agent move the conversation to a near-miss dept in one click. */}
      {/* Tucked with the other rows while a reply is written or the thread is read (compact). */}
      {nearMissDepts.length > 0 &&
        !nearMissDismissed &&
        !compact &&
        message.status !== 'resolved' &&
        message.status !== 'closed' && (
          <NearMissBanner
            message={message}
            nearMissDepts={nearMissDepts}
            allDepts={allDepts}
            nearMissText={nearMissText}
            routingTo={routingTo}
            handleManualRoute={handleManualRoute}
            setNearMissDismissed={setNearMissDismissed}
          />
        )}

      {/* Meta strip. null = the sidebar exists but its node is not mounted yet (first paint):
          render nothing rather than inline-then-move, which jumped the layout and briefly
          showed Dept/Assigned twice. */}
      {isPhone ? null : metaTarget === null ? null : metaTarget ? (
        createPortal(<HeaderMetaStrip layout="rows" {...metaStripProps} />, metaTarget)
      ) : compact ? null : (
        <HeaderMetaStrip {...metaStripProps} />
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
          if (alreadyOn) {
            toast.info(
              `This thread is already on ticket ${ticketDisplayId({ id: ticketId, reference: ticket.reference }, orgCode)}.`
            );
          }
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
