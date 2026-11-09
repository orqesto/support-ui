import { useState, useEffect, useRef, useCallback } from 'react';
import {
  type AddOutcome,
  appendReplyParagraph,
  replyHasSentence,
  useLookupsTab,
} from '@/features/custom-api';
import { emptyRecipientDraft, type RecipientDraft } from './RecipientFields';
import { organizationService } from '@/services/organization.service';
import { useAuthStore } from '@/stores/authStore';
import { useQuery } from '@tanstack/react-query';
import type { AssignOnReplyPrompt } from './assignOnReplyPrompt';
import { shouldShowHistoryBanner } from './historyBanner';
import { MessageDetailHeader } from './MessageDetailHeader';
import { MessageComposer } from './MessageComposer';
import { useThreadMergeContext } from './useThreadMergeContext';
import { MessageActionStrip } from './MessageActionStrip';
import { ResolveDecisions } from './ResolveDecisions';
import { shortcutHint, useDetailShortcuts, type ShortcutContext } from './detailShortcuts';
import { useAiDraftsOff } from '@/features/settings/shell';
import { Permission } from '@/types/roles';
import { useThreadFileViewer } from './useThreadFileViewer';
import { MessagePanelTabs } from './MessagePanelTabs';
import { SendFailedBar } from './SendFailedBar';
import { isBlankRichText } from '@/lib/stripHtml';
import { readSendAction, type SendAction } from './ComposerSendButton';
import { holdsUnsentNote } from './messageDetail/detailConstants';
import type { MessageDetailProps } from './messageDetail/types';
import { useThreadEvents } from './messageDetail/useThreadEvents';
import { useComposerText } from './messageDetail/useComposerText';
import { useThreadUnsentDraft } from './messageDetail/useThreadUnsentDraft';
import { useGuardedClassify } from './messageDetail/useGuardedClassify';
import { useDetailDialogs } from './messageDetail/useDetailDialogs';
import { useReplyComposerState } from './messageDetail/useReplyComposerState';
import { useLiveThreadSync } from './messageDetail/useLiveThreadSync';
import { useGhostOption } from './messageDetail/useGhostOption';
import { usePanelTabs } from './messageDetail/usePanelTabs';
import { useLookupFlash } from './messageDetail/useLookupFlash';
import { useThreadScrollPin } from './messageDetail/useThreadScrollPin';
import { useThreadPanelsData } from './messageDetail/useThreadPanelsData';
import { deriveThreadFlags } from './messageDetail/threadFlags';
import { useReplySend } from './messageDetail/useReplySend';
import { useConversationActions } from './messageDetail/useConversationActions';
import { useNoteGuard } from './messageDetail/useNoteGuard';
import { useGhostAnswer } from './messageDetail/useGhostAnswer';
import { PresenceEye } from '../presence/PresenceEye';
import { usePresenceWatch } from '../presence/usePresenceWatch';
import { useWritingGuard } from '../presence/useWritingGuard';
import { WritingGuardContext } from '../presence/writingGuardContext';
import { useThreadActivity } from '../presence/useThreadActivity';
import { ThreadActivityBanner } from '../presence/ThreadActivityBanner';
import { useIsPhone } from '../hooks/useIsPhone';
import { useThreadActions } from './messageDetail/useThreadActions';
import { useThreadTimeline } from './messageDetail/useThreadTimeline';
import { ThreadScroller } from './messageDetail/ThreadScroller';
import { MessageDetailOverlays } from './messageDetail/MessageDetailOverlays';

export type { MessageDetailProps } from './messageDetail/types';

// ─── Component ────────────────────────────────────────────────────────────────

export function MessageDetail({
  message,
  onClose,
  onApprove,
  onReject,
  onReopen,
  onDelete,
  onResolve,
  onRefresh,
  onStatusChanged,
  onReadChanged,
  onRegisterRequestClose,
  isFullPage: isFullPageProp,
  onReplied,
  onOptimisticMove,
  onClassify,
  onNavigate,
  recordPending = false,
}: MessageDetailProps) {
  // Full-page view has its own Back bar; the slide-over derives it from onClose.
  const fullPage = isFullPageProp ?? !onClose;
  // ── Thread state ───────────────────────────────────────────────────────────
  const thread = useThreadEvents(message, onRefresh, onStatusChanged);
  const {
    threadRefreshKey,
    setThreadRefreshKey,
    onRefreshRef,
    rereadHeaderRef,
    threadPage,
    panelsBump,
    attachmentsBump,
    activityBump,
    participantsBump,
    notesBump,
    setNotesBump,
    participantsRef,
    pullNewEventsRef,
    pullLiveEvents,
    sortedThread,
  } = thread;

  // ── Composer state ─────────────────────────────────────────────────────────
  const composerText = useComposerText();
  const {
    composer,
    handleAiSourceChange,
    composerMode,
    setComposerMode,
    latestComposer,
    lastEditMode,
    writeComposer,
  } = composerText;
  // Thread presence: who else is here, and this tab's own state (composer words + mode).
  const presence = usePresenceWatch([message.id], {
    composerText: composer,
    composerMode,
    lastAgentEditAt: composerText.lastAgentEditAt,
  });
  const presenceIsPhone = useIsPhone();
  // Close / resolve / assign / move / merge / spam ask first while a colleague writes a reply
  // (spec §5.5); what a colleague just did shows as one live banner (§5.3).
  const writingGuard = useWritingGuard(presence.viewers);
  const guard = writingGuard.confirmIfWriting;
  const threadActivity = useThreadActivity(message.id);
  const dialogs = useDetailDialogs(message);
  const {
    submitting,
    resolving,
    setResolving,
    savingToKb,
    setReopenDialogOpen,
    setNotCustomerWorkOpen,
    setPromoteToKbOpen,
    hasPermission,
    isTriage,
    readState,
  } = dialogs;
  const replyState = useReplyComposerState(message, composerMode);
  const {
    selectedFiles,
    setSelectedFiles,
    sendFailedError,
    setSendFailedError,
    sendFailureRetryable,
    setSendFailureRetryable,
    lastAssignRef,
    lastSendModeRef,
    richEditorRef,
    noteEditorRef,
    composerWindow,
  } = replyState;

  useLiveThreadSync({
    message,
    pullLiveEvents,
    onStatusChanged,
    setThreadRefreshKey,
    rereadHeaderRef,
    onRefreshRef,
    pullNewEventsRef,
    setSendFailureRetryable,
    setSendFailedError,
  });

  // ── AI ghost state ─────────────────────────────────────────────────────────
  const [aiLoading, setAiLoading] = useState(false);
  // A reply a model wrote before AI drafts were switched off is still stored on the message and
  // nothing server-side can take it back — so it pre-fills the ghost only once the setting is
  // KNOWN to be on (same rule as the AI tab's options).
  const { off: aiDraftsOff, resolved: aiDraftsKnown } = useAiDraftsOff();
  const offerStoredDraft = aiDraftsKnown && !aiDraftsOff;
  const { ghostOption, alternativeCount, setAlternativeCount } = useGhostOption(
    message,
    offerStoredDraft
  );

  // ── Similar messages dialog ────────────────────────────────────────────────
  const [similarOpen, setSimilarOpen] = useState(false);

  // ── Panel tab state ────────────────────────────────────────────────────────
  const {
    tab,
    setTab,
    panelOpen,
    setPanelOpen,
    sideMetaEl,
    setSideMetaEl,
    twoColumn,
    isPhone,
    detailRootRef,
  } = usePanelTabs(message, fullPage);

  /*
    v4 composer "Look up": open the Lookups tab and bring the Connected systems block into view.
    ⛔ Offered only when the lookup panel itself would render — the SAME cached availability query
    (react-query key shared with CustomApiLookupPanel's thread surface), so this adds no request.
    It fails closed exactly like the panel: loading, error or an older backend ⇒ no button.
  */
  // The SAME gate as the tab itself (useLookupsTab), so the button never points at a hidden tab.
  const lookupAvailable = useLookupsTab('thread').available;
  const { handleLookUp } = useLookupFlash({
    message,
    tab,
    setTab,
    lookupAvailable,
    twoColumn,
    setPanelOpen,
  });

  // ── Notes / activity / attachments / lead state ────────────────────────────
  const user = useAuthStore((store) => store.user);
  const currentUserId = user?.id ?? null;
  /*
    Send ▾ (2026-10-29, as Zendesk's submit-as): what happens to the conversation once the reply
    is out. The face is the agent's last choice on this browser. The after-send step rides in a
    ref so the assign-on-reply prompt, which sends later, still runs it.
  */
  const [sendAction, setSendAction] = useState<SendAction>(() =>
    readSendAction(currentUserId ?? undefined)
  );
  // The signed-in agent can arrive after the first render: read their choice once they do.
  useEffect(() => {
    setSendAction(readSendAction(currentUserId ?? undefined));
  }, [currentUserId]);
  const afterSendRef = useRef<{ action: SendAction; hold?: { reason: string; until: Date } }>({
    action: 'send',
  });
  const [sendHoldOpen, setSendHoldOpen] = useState(false);
  // The header stays whole at all times (owner, 2026-11-04): it no longer folds its sender, status
  // and meta rows away while scrolling the thread or writing a reply.
  const scrollPin = useThreadScrollPin(message, isPhone, sortedThread);
  const { threadScrollerRef } = scrollPin;

  // Ownership prompt on Send (owner decision 2026-09-07). The workspace setting rides on the
  // organization payload every member may read; cached, one read per session.
  const { data: currentOrganization } = useQuery({
    queryKey: ['current-organization-for-reply', currentUserId],
    queryFn: () => organizationService.getCurrent(),
    staleTime: 5 * 60 * 1000,
    enabled: currentUserId !== null,
  });
  const [assignPrompt, setAssignPrompt] = useState<AssignOnReplyPrompt | null>(null);

  const {
    notes,
    setNotes,
    messageActivity,
    noteActivityLog,
    setNoteActivityLog,
    attachmentsByMessageId,
    leadState,
    setLeadState,
    leadFieldDefs,
  } = useThreadPanelsData({
    message,
    threadRefreshKey,
    panelsBump,
    notesBump,
    setNotesBump,
    activityBump,
    attachmentsBump,
  });

  // ── Computed flags ─────────────────────────────────────────────────────────
  const {
    isFiltered,
    isSuspicious,
    isSpamFlaggedOutsideTriage,
    isActive,
    resolveMode,
    ghostVisible,
    autoReply,
  } = deriveThreadFlags(message);

  // ── Handlers ───────────────────────────────────────────────────────────────

  // Email-only: addressing is meaningless on channels whose transport has no
  // concept of a second recipient, and offering it there would promise something
  // the send path cannot honour.
  const supportsRecipients = message.channel === 'email';
  const [recipientDraft, setRecipientDraft] = useState<RecipientDraft>(emptyRecipientDraft);
  // Unsent text survives a closed panel, a page change or a killed phone tab (this browser only).
  const { restoredDraft, restoredFiles, discardRestoredDraft, beginDraftSend } =
    useThreadUnsentDraft({
      threadId: message.id,
      composerText,
      recipientDraft,
      setRecipientDraft,
      sendKeyRef: replyState.sendIdempotencyKeyRef,
      sendFailedError,
      fileCount: selectedFiles.length,
    });
  // Merge labels on the timeline + everyone on the thread, for Reply all (owner, 2026-09-23).
  const mergeContext = useThreadMergeContext(
    message.id,
    supportsRecipients,
    threadRefreshKey + panelsBump,
    participantsBump
  );
  participantsRef.current = mergeContext.participants;

  const send = useReplySend({
    beginDraftSend,
    message,
    composerText,
    dialogs,
    replyState,
    thread,
    supportsRecipients,
    recipientDraft,
    setRecipientDraft,
    afterSendRef,
    setSendHoldOpen,
    setSendAction,
    setAssignPrompt,
    currentUserId,
    currentOrganization,
    resolveMode,
    onReplied,
    onResolve,
    onOptimisticMove,
    onRefresh,
  });
  const {
    performSend,
    handleSend,
    sendActions,
    handleSendWith,
    handleSendPick,
    handleOpenTemplates,
  } = send;

  const conv = useConversationActions({
    message,
    resolveMode,
    dialogs,
    onResolve,
    onReadChanged,
    onClose,
    onRegisterRequestClose,
    guard,
  });
  const { handleToggleRead, handleRequestClose, openResolveDialog, openResolveToKbDialog } = conv;

  // One context for the shortcuts AND the hint line, so the hint can only name keys that act.
  const shortcutContext: ShortcutContext = {
    canResolve: resolveMode !== null,
    canNavigate: onNavigate !== undefined,
    // U acts exactly where the header shows the read/unread toggle (triage queues).
    canToggleRead: isTriage,
    // Esc closes the slide-over only; the full page has its own Back bar.
    canClose: onClose !== undefined && !fullPage,
    busy: resolving,
  };
  /*
    Phones show the composer only under the Thread and Notes tabs (it is display:none under the
    others), and an editor that is not displayed cannot take focus. R and N there go back to the
    Thread tab first, so the editor they focus is on screen (Notes already shows the composer, so
    it stays). Desktop: the composer always shows, and nothing moves.
  */
  const showComposerForShortcut = useCallback(() => {
    if (isPhone && panelOpen && tab !== 'notes') setPanelOpen(false);
  }, [isPhone, panelOpen, tab, setPanelOpen]);
  /*
    A lookup record's "Use in reply": the ticked sentence goes into the REPLY — a new paragraph at
    its end, the composer switched to Reply, shown (phone: back to the Thread tab, where the
    composer lives) and focused. It is the agent's own text, so no AI source is stamped; pressing
    AI draft afterwards reads it as the agent's note.
  */
  const addRecordToReply = useCallback(
    (sentence: string): AddOutcome => {
      const current = latestComposer.current;
      /*
        ⛔ The composer holds ONE text for both modes. Switching an internal note being written to
        Reply would carry that note — words for the team — into a message to the customer.
      */
      if (holdsUnsentNote(current, lastEditMode.current)) return 'note_in_progress';
      // The exact sentence is already there: saying it twice to the customer helps nobody.
      if (replyHasSentence(current, sentence)) return 'duplicate';
      const next = appendReplyParagraph(current, sentence);
      writeComposer(next, 'reply');
      setComposerMode('reply');
      showComposerForShortcut();
      // Deferred: from note mode the reply editor mounts with this render; on a phone the composer
      // is display:none under the Lookups tab until the Thread tab is back.
      setTimeout(() => richEditorRef.current?.focus('end'), 0);
      return 'added';
    },
    [
      showComposerForShortcut,
      writeComposer,
      lastEditMode,
      latestComposer,
      richEditorRef,
      setComposerMode,
    ]
  );
  const { setPanelComposerMode, refuseReplyOverNote, handleReplyToMessage } = useNoteGuard({
    setComposerMode,
    latestComposer,
    lastEditMode,
    setRecipientDraft,
  });
  // Pressing a file in the thread opens it in the viewer, over the thread, with the whole
  // conversation to step through — no detour to the Files tab (owner request 2026-11-04).
  const threadFileViewer = useThreadFileViewer(
    threadScrollerRef,
    sortedThread,
    attachmentsByMessageId,
    message.id
  );
  const handleOpenAttachment = threadFileViewer.openAttachment;
  const handleOpenInlineImage = threadFileViewer.openInlineImage;

  useDetailShortcuts(shortcutContext, {
    reply: () => {
      if (refuseReplyOverNote()) return;
      showComposerForShortcut();
      setComposerMode('reply');
      // Deferred: in note mode the reply editor is not mounted until the swap settles.
      setTimeout(() => richEditorRef.current?.focus(), 0);
    },
    note: () => {
      showComposerForShortcut();
      setComposerMode('note');
      setTimeout(() => noteEditorRef.current?.focus(), 0);
    },
    resolve: openResolveDialog,
    toggleRead: handleToggleRead,
    next: () => onNavigate?.('next'),
    prev: () => onNavigate?.('prev'),
    // The prompt-aware close — the same one the header X and the backdrop use.
    close: handleRequestClose,
  });

  const ghost = useGhostAnswer({
    writeComposer,
    setComposerMode,
    showComposerForShortcut,
    richEditorRef,
    handleAiSourceChange,
    latestComposer,
    lastEditMode,
  });
  const { handleGhostClick } = ghost;

  // Moving to spam asks first while a colleague writes a reply (§5.5).
  const classify = useGuardedClassify(guard, onClassify);

  const threadActions = useThreadActions({
    message,
    user,
    setResolving,
    setThreadRefreshKey,
    setNotes,
    setNoteActivityLog,
    onReject,
    onReopen,
    onClassify: classify,
    onDelete,
    onRefresh,
  });
  const {
    handleReopen,
    handleClassify,
    handleDelete,
    handleRefresh,
    labelsRefreshKey,
    handleContactChanged,
    handleNoteUpdated,
    handleNoteDeleted,
    handleCheckContradiction,
    handleDismissContradiction,
  } = threadActions;

  // ── History banner ─────────────────────────────────────────────────────────
  // The predicate lives in `historyBanner.ts` with the reasoning: it must match the backend's
  // definition of "we did not write this", and it is unit-tested there — every test that renders
  // the page around this component mocks the component itself out.
  const showHistoryBanner = shouldShowHistoryBanner(sortedThread);

  const timelineData = useThreadTimeline(sortedThread, notes, attachmentsByMessageId);
  const { flatAttachments } = timelineData;

  // ── Render ─────────────────────────────────────────────────────────────────

  // Tabbed panel. In the slide-over it sits above the thread and its Thread tab gives the space
  // back; on the wide full page (v3) it is the right sidebar, always showing, beside the thread.
  const panelTabs = (
    <MessagePanelTabs
      /*
          Only while the composer exists (it renders only on an ACTIVE thread). On a closed,
          filtered or suspicious thread there is no reply on screen: "Added to your
          reply" would put the sentence into hidden composer state, to surface later if the thread
          reopens. The record cards still show there, without the insert control.
        */
      onUseInReply={isActive ? addRecordToReply : undefined}
      variant={twoColumn ? 'sidebar' : 'rail'}
      message={message}
      tab={tab}
      setTab={setTab}
      panelOpen={panelOpen}
      setPanelOpen={setPanelOpen}
      notes={notes}
      onNoteUpdated={handleNoteUpdated}
      onNoteDeleted={handleNoteDeleted}
      onNotesChanged={thread.onHoldReasonCleared}
      noteActivityLog={noteActivityLog}
      messageActivity={messageActivity}
      sortedThread={sortedThread}
      threadRefreshKey={threadRefreshKey + attachmentsBump}
      attachments={flatAttachments}
      currentUserId={currentUserId}
      leadState={leadState}
      setLeadState={setLeadState}
      leadFieldDefs={leadFieldDefs}
      // Same rule as onUseInReply above: no composer, so no "Use in reply" into hidden state.
      onGhostClick={isActive ? handleGhostClick : undefined}
      // Passed as the setters themselves: React guarantees a stable identity for a
      // useState setter, while the inline arrows they replace were a NEW function on
      // every render. AiTabPanel's fetch effect can only declare these as honest
      // dependencies if they hold still.
      onOptionsLoaded={setAlternativeCount}
      onAiLoadingChange={setAiLoading}
      setComposerMode={setPanelComposerMode}
      noteEditorRef={noteEditorRef}
      onCheckContradiction={handleCheckContradiction}
      onDismissContradiction={handleDismissContradiction}
      onRefresh={handleContactChanged}
    />
  );

  /*
    v4 mobile resolve row (M6): on a phone it leaves the composer and sits after the thread, above
    it — and only while the Thread tab is showing. Same handlers and dialogs as the desktop row.
  */
  const decisionsFor = (variant: 'inline' | 'phone') => (
    <ResolveDecisions
      variant={variant}
      mode={resolveMode}
      busy={resolving}
      savingToKb={savingToKb}
      // The SAME dialogs the old header split button opened: an unreviewed thread is
      // dismissed through the reject dialog, an active one closes through the no-KB
      // confirm. Nothing new reaches the BE.
      onResolve={openResolveDialog}
      onResolveToKb={openResolveToKbDialog}
      onNotCustomerWork={() => setNotCustomerWorkOpen(true)}
      // Owner, 2026-09-22: the agent resolving AS spam is the CONFIRMED layer.
      onResolveAsSpam={
        classify ? () => void classify('move_to_spam', undefined, undefined, true) : undefined
      }
    />
  );

  return (
    /*
      v4 mobile: the DOCUMENT scrolls on a phone (so the browser's pull-to-refresh works), so
      below 640px nothing here clips or scrolls — the boxes take their content's height, and the
      header row, the tab strip and the composer stick instead. `--md-sticky-top` is where they
      stick: under the app's fixed mobile header (a phone always opens the full page, never the
      slide-over — usePhoneOpensMessageAsPage). Sideways it CLIPS (`overflow-x: clip`, which —
      unlike hidden — makes no scroll container, so sticking still works): an over-wide value must
      not widen the page. Inputs are 16px on phones so iOS does not zoom on focus.
    */
    <WritingGuardContext.Provider value={guard}>
      <div
        ref={detailRootRef}
        data-testid="message-detail-root"
        style={
          {
            '--md-sticky-top': 'var(--mobile-header-h, 0px)',
          } as React.CSSProperties
        }
        className={`flex h-full min-h-0 overflow-hidden ${twoColumn ? '' : 'flex-col'} max-sm:block max-sm:h-auto max-sm:overflow-visible max-sm:overflow-x-clip max-sm:[&_input]:text-base max-sm:[&_textarea]:text-base max-sm:[&_.ProseMirror]:text-base`}
      >
        <div className="flex overflow-hidden flex-col flex-1 min-w-0 min-h-0 max-sm:overflow-visible max-sm:overflow-x-clip max-sm:bg-card">
          {/* Header */}
          <MessageDetailHeader
            message={message}
            presence={
              <PresenceEye
                available={presence.available}
                viewers={presence.viewers}
                isPhone={presenceIsPhone}
              />
            }
            onClose={onClose ? handleRequestClose : undefined}
            showFullPageButton={!!onClose && !fullPage}
            isFullPage={fullPage}
            threadCount={threadPage?.total ?? sortedThread.length}
            onRefresh={handleRefresh}
            labelsRefreshKey={labelsRefreshKey}
            onContactChanged={handleContactChanged}
            onDelete={onDelete ? handleDelete : undefined}
            onApprove={onApprove}
            onClassify={classify}
            onOptimisticMove={onOptimisticMove}
            showReadToggle={isTriage}
            isRead={readState}
            onToggleRead={handleToggleRead}
            metaTarget={twoColumn ? sideMetaEl : undefined}
            merges={mergeContext.merges}
            onReloadMerges={mergeContext.reloadMerges}
            onMergeChange={mergeContext.applyMergeChange}
          />

          {/* History banner */}
          {showHistoryBanner && (
            <div className="flex-shrink-0 px-4 py-1.5 text-[11px] text-warning bg-warning-muted border-b border-warning-line">
              This thread starts with an outbound message — older history may be missing.
            </div>
          )}

          {sendFailedError && (
            <SendFailedBar
              reason={sendFailedError}
              // Only while the failed draft is still there to resend (a blank composer means the
              // agent cleared it, or the async failure came after the send cleared it).
              onRetry={
                sendFailureRetryable &&
                !isBlankRichText(composer) &&
                composerMode === lastSendModeRef.current
                  ? () => void performSend(lastAssignRef.current)
                  : undefined
              }
              retrying={submitting}
              onDismiss={() => setSendFailedError(null)}
            />
          )}

          {/* What a colleague just did here (thread presence). "view" re-reads the thread; the
            draft stays. */}
          <ThreadActivityBanner
            activity={threadActivity.activity}
            onView={handleRefresh}
            onDismiss={threadActivity.dismiss}
          />

          {/* State strip (v3): under the header, where the state it explains is shown. */}
          <MessageActionStrip
            message={message}
            isFiltered={isFiltered}
            isSuspicious={isSuspicious}
            isSpamFlaggedOutsideTriage={isSpamFlaggedOutsideTriage}
            isActive={isActive}
            hasLinkedTicket={false}
            onReopen={handleReopen}
            onDelete={onDelete ? handleDelete : undefined}
            onClassify={handleClassify}
            // UX gate only — the BE re-validates (MANAGE_TICKETS on both endpoints). Offering an
            // action that answers 403 is worse than not offering it.
            onPromoteToKb={
              hasPermission(Permission.MANAGE_TICKETS) ? () => setPromoteToKbOpen(true) : undefined
            }
            setReopenDialogOpen={setReopenDialogOpen}
            onRefresh={handleRefresh}
          />

          {!twoColumn && panelTabs}

          <ThreadScroller
            thread={thread}
            scrollPin={scrollPin}
            timelineData={timelineData}
            panelOpen={panelOpen}
            twoColumn={twoColumn}
            mergeContext={mergeContext}
            supportsRecipients={supportsRecipients}
            isActive={isActive}
            handleReplyToMessage={handleReplyToMessage}
            attachmentsByMessageId={attachmentsByMessageId}
            handleOpenAttachment={handleOpenAttachment}
            handleOpenInlineImage={handleOpenInlineImage}
            aiLoading={aiLoading}
            ghostVisible={ghostVisible}
            ghostOption={ghostOption}
            autoReply={autoReply}
            composer={composer}
            composerMode={composerMode}
            message={message}
            alternativeCount={alternativeCount}
            handleGhostClick={handleGhostClick}
            setTab={setTab}
            setPanelOpen={setPanelOpen}
          />

          {/* Phone: the resolve row between the thread and the composer, Thread tab only (M6) — and,
            as on desktop, only while the composer is on Reply: a note is not an answer. */}
          {/* Hidden while a reply is typed, as on desktop: Send ▾ carries the resolve choices. */}
          {isPhone &&
            isActive &&
            !panelOpen &&
            composerMode === 'reply' &&
            isBlankRichText(composer) &&
            decisionsFor('phone')}

          {/* Composer — shown for active conversations. On a phone, only under the Thread or Notes
            tab (M7) — hidden, not unmounted, so a draft and its AI undo survive a tab visit. */}
          {isActive && (
            <MessageComposer
              hidden={isPhone && panelOpen && tab !== 'notes'}
              shortcutHint={shortcutHint(shortcutContext)}
              message={message}
              composer={composer}
              setComposer={writeComposer}
              restoredDraft={restoredDraft}
              restoredFiles={restoredFiles}
              onDiscardRestoredDraft={discardRestoredDraft}
              composerMode={composerMode}
              setComposerMode={setComposerMode}
              submitting={submitting}
              // Ctrl+Shift+Enter (and the folded box's round Send) is always a plain Send: a keystroke never
              // resolves or saves to the KB — that takes the Send ▾ button, as resolving takes its
              // dialog (openResolveDialog). Notes post as before.
              onSend={() => (composerMode === 'reply' ? handleSendWith('send') : void handleSend())}
              sendActions={sendActions}
              // A NEW thread starts on plain Send whatever was remembered (owner, 2026-11-03): a habit
              // click on "Send and resolve" must not close a first contact. The ▾ menu still offers it.
              sendAction={resolveMode === 'unreviewed' ? 'send' : sendAction}
              onSendWith={handleSendWith}
              onSendPick={handleSendPick}
              richEditorRef={richEditorRef}
              noteEditorRef={noteEditorRef}
              onOpenSimilarMessages={() => setSimilarOpen(true)}
              onLookUp={lookupAvailable ? handleLookUp : null}
              selectedFiles={selectedFiles}
              onFilesChange={setSelectedFiles}
              onAiSourceChange={handleAiSourceChange}
              sendBlockedReason={
                // Until the full record lands the reply block / WhatsApp window are unknown: Send
                // waits (a tooltip, no banner — `info` tone) rather than guess they are open.
                recordPending
                  ? 'Loading the conversation…'
                  : composerWindow.blocked
                    ? composerWindow.notice
                    : null
              }
              windowRemaining={recordPending ? undefined : composerWindow.remaining}
              windowTone={recordPending ? 'info' : composerWindow.tone}
              onUseTemplate={
                // Offered only on a blocked WhatsApp conversation — that is the one state in
                // which a billable template send is the right move rather than an expensive
                // way to say something a free reply could have carried.
                composerWindow.blocked && message.channel === 'whatsapp'
                  ? () => void handleOpenTemplates()
                  : null
              }
              decisions={
                // Under the reply, where the answer is written (v3, 2026-09-23). Reply mode only: a
                // note is not an answer, and a note's Post button must not sit beside Resolve.
                // Phones render it above the composer instead (M6).
                composerMode === 'reply' && !isPhone ? decisionsFor('inline') : null
              }
              // Hidden until the full record lands: the To line would show the requester where the
              // customer's Reply-To belongs. The draft itself is kept.
              recipientDraft={supportsRecipients && !recordPending ? recipientDraft : undefined}
              onRecipientDraftChange={
                supportsRecipients && !recordPending ? setRecipientDraft : undefined
              }
              participants={supportsRecipients ? mergeContext.participants : undefined}
            />
          )}
        </div>

        {/* v4: the sidebar grows with the window — 312px (the v3 width, and what 1024px leaves room
          for) up to 520px, 30% of the VIEWPORT between (vw, so the sidebar tops out at 520px
          however wide the page is). */}
        {twoColumn && (
          <aside
            data-testid="detail-sidebar"
            className="flex flex-col flex-none w-[clamp(312px,30vw,520px)] min-h-0 border-l border-border bg-card"
          >
            <div ref={setSideMetaEl} className="flex-none" />
            {panelTabs}
          </aside>
        )}

        <MessageDetailOverlays
          message={message}
          dialogs={dialogs}
          replyState={replyState}
          send={send}
          conv={conv}
          ghost={ghost}
          threadActions={threadActions}
          assignPrompt={assignPrompt}
          setAssignPrompt={setAssignPrompt}
          onClose={onClose}
          sendHoldOpen={sendHoldOpen}
          setSendHoldOpen={setSendHoldOpen}
          afterSendRef={afterSendRef}
          similarOpen={similarOpen}
          setSimilarOpen={setSimilarOpen}
        />

        {/* The file viewer — over the thread, which stays mounted and where it was. */}
        {threadFileViewer.viewer}
        {writingGuard.dialog}
      </div>
    </WritingGuardContext.Provider>
  );
}
