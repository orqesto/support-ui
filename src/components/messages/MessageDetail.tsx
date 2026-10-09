// Over the 650-line cap — same pattern as MessageDetailHeader. The per-user
// read/unread toggle + close prompt pushed it over; splitting the confirm-dialog
// wiring out is the natural follow-up refactor.
/* eslint-disable max-lines */
import { Fragment, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { RecordInsertTargetContext, useAiRecordNote, type AddOutcome } from './useAiRecordNote';
import { appendReplyParagraph, replyHasSentence } from './customApiRecordNote';
import { useAiConfigured } from '@/hooks/useAiConfigured';
import { usePhoneDetailScroll } from './usePhoneDetailScroll';
import { useLookupsTab } from './lookupsTab';
import { draftToRecipients, emptyRecipientDraft, type RecipientDraft } from './RecipientFields';
import {
  messageService,
  type AiDraft,
  type MessageNote,
  type MessageActivityEntry,
  type ReplyAssignIntent,
} from '@/services/message.service';
import {
  organizationService,
  type LeadQualificationFieldConfig,
} from '@/services/organization.service';
import { getSpamCheck, isTriageMessage } from '@/lib/messageHelpers';
import {
  getSocket,
  releaseSocket,
  subscribeToEvent,
  unsubscribeFromEvent,
} from '@/lib/socketManager';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/authStore';
import { useQuery } from '@tanstack/react-query';
import { AssignOnReplyDialog } from './AssignOnReplyDialog';
import {
  decideAssignOnReplyPrompt,
  readAssignOnReplySetting,
  type AssignOnReplyPrompt,
} from './assignOnReplyPrompt';
import type { Message, MessageEvent } from '@/types';
import { shouldShowHistoryBanner } from './historyBanner';
import { MessageDetailHeader } from './MessageDetailHeader';
import { MessageComposer } from './MessageComposer';
import { useThreadMergeContext } from './useThreadMergeContext';
import { MessageActionStrip } from './MessageActionStrip';
import { ResolveDecisions } from './ResolveDecisions';
import { MessageGhostBubble } from './MessageGhostBubble';
import { getResolveMode, noKbResolveDialog } from './resolveMode';
import { shortcutHint, useDetailShortcuts, type ShortcutContext } from './detailShortcuts';
import { dayLabel, dayStarts, threadTimeOf } from './threadDays';
import { MessageDetailConfirmDialogs } from './MessageDetailConfirmDialogs';
import { PromoteToKbDialog } from './PromoteToKbDialog';
import { useAiDraftsOff } from '@/hooks/useAiDraftsOff';
import { usePermissions } from '@/hooks/usePermissions';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useIsPhone } from './useIsPhone';
import { Permission } from '@/types/roles';
import { ThreadMessageItem } from './ThreadMessageItem';
import { ThreadNoteItem } from './ThreadNoteItem';
import type { KBAttachment } from './AiTabPanel';
import { MessagePanelTabs } from './MessagePanelTabs';
import type { Attachment } from './MessageAttachments';
import { useLeadState } from './useLeadState';
import { SimilarMessagesDialog } from '@/components/modals/SimilarMessagesDialog';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { logger } from '@/lib/logger';
import { normaliseThreadPage, type ThreadPage } from '@/services/threadPage';
import {
  isRetryableSendFailure,
  resolveSendFailureMessage,
} from '@/components/messages/sendErrorMessage';
import { SendFailedBar } from './SendFailedBar';
import { resolveComposerWindow } from '@/components/messages/whatsappWindowState';
import { WhatsAppTemplatePicker } from '@/components/messages/WhatsAppTemplatePicker';
import type { WhatsAppTemplate } from '@/components/messages/whatsappTemplates';
import { isBlankRichText, stripHtml } from '@/lib/stripHtml';
import { toast } from '@/lib/toast';
import type { RichTextEditorHandle } from '@/components/shared/RichTextEditor';
import { getApiErrorMessage } from '@/lib/errorMessages';
import {
  toGhostOption,
  answerToEditorHtml,
  type GhostOption,
  type SuggestedAnswerMeta,
  LABEL,
  type PanelTab,
} from './messageDetailConstants';

/** v4 ".k-flash": a short ring on the Connected systems block after the composer's Look up. */
const LOOKUP_FLASH_CLASSES = ['ring-[3px]', 'ring-primary-line', 'rounded-[8px]'];
const LOOKUP_FLASH_MS = 1200;
const LOOKUP_SEEK_FRAMES = 10;
/**
 * Events per page of the thread. A thread is read latest page first; "Show earlier messages"
 * fetches the page before it. 300 is a working day of a busy ticket; the thread that made this
 * necessary held 1,887 (a mailer-daemon Gmail thread), and rendering every one on open fetched
 * every markup and spent the API limiter.
 */
const THREAD_PAGE = 300;
/*
  ⛔ The composer holds ONE text for both modes: turning words WRITTEN AS A TEAM NOTE into Reply
  would put them one Send from the customer. Every path that would (rail tabs, "Reply to this
  message", R, the lookup insert, a KB / suggested answer) asks this ONE rule. Keyed on the mode
  the text was last EDITED in, not the mode on screen: a reply carried into note mode by N is
  still a reply and may go back; a blank composer always may.
*/
const holdsUnsentNote = (html: string, lastEditMode: 'reply' | 'note' | null) =>
  lastEditMode === 'note' && !isBlankRichText(html);
const NOTE_IN_PROGRESS = 'Post or clear your internal note first';

// ─── Props ────────────────────────────────────────────────────────────────────

export type MessageDetailProps = {
  message: Message;
  onClose?: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  onReopen?: () => void;
  onDelete?: () => void;
  onResolve?: () => void;
  onRefresh?: () => void;
  /** Fired after the per-user read/unread state changes, so the board can refresh
   *  the triage unread indicator without closing the detail. */
  onReadChanged?: () => void;
  /** Registers this panel's prompt-aware close handler with the parent, so that
   *  close gestures OUTSIDE the panel (e.g. the backdrop, or the full-page Back
   *  button) route through the same "Mark as read?" prompt as the header X.
   *  Passed null on unmount. */
  onRegisterRequestClose?: (requestClose: (() => void) | null) => void;
  /** Rendered as the standalone full-page view (has its own Back bar): suppress
   *  the header X + "open full page" button even though onClose is provided. */
  isFullPage?: boolean;
  /**
   * J/K: open the next / previous conversation in the list the user is looking at. Passed only
   * where that list has an unambiguous order (the threads view) — omitted, J/K do nothing.
   */
  onNavigate?: (direction: 'next' | 'prev') => void;
  /** Fired after a customer reply is sent (not notes) — the conversation flips to
   *  "Pending" (awaiting the customer), letting the board move the card optimistically. */
  onReplied?: () => void;
  /** Optimistically move the board card to a column after a manual status change
   *  (park / resolve / reopen) from the detail header. */
  onOptimisticMove?: (columnId: string) => void;
  onClassify?: (
    action: 'approve' | 'mark_suspicious' | 'move_to_spam' | 'confirm_spam',
    createDetectionRule?: boolean,
    trainSpamFilter?: boolean,
    /** move_to_spam only: the agent's own decision — bin AND record it as confirmed spam. */
    confirm?: boolean
  ) => Promise<void>;
};

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
  onReadChanged,
  onRegisterRequestClose,
  isFullPage: isFullPageProp,
  onReplied,
  onOptimisticMove,
  onClassify,
  onNavigate,
}: MessageDetailProps) {
  // Full-page view has its own Back bar; the slide-over derives it from onClose.
  const fullPage = isFullPageProp ?? !onClose;
  // ── Thread state ───────────────────────────────────────────────────────────
  const [threadMessages, setThreadMessages] = useState<MessageEvent[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [threadRefreshKey, setThreadRefreshKey] = useState(0);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  // What the thread endpoint left out (threadPage.ts). A refresh re-reads as many events as are
  // on screen, so a window the agent expanded is not folded back by a new message arriving.
  const [threadPage, setThreadPage] = useState<ThreadPage | null>(null);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const threadSize = useRef({ id: message.id, loaded: 0 });
  const messageIdRef = useRef(message.id);
  messageIdRef.current = message.id;

  useEffect(() => {
    let cancelled = false;
    setThreadLoading(true);
    setThreadError(null);
    if (threadSize.current.id !== message.id) threadSize.current = { id: message.id, loaded: 0 };
    messageService
      .getThreadMessages(message.id, { limit: Math.max(THREAD_PAGE, threadSize.current.loaded) })
      .then((res) => {
        if (cancelled) return;
        const rows = res.data ?? [];
        threadSize.current = { id: message.id, loaded: rows.length };
        setThreadMessages(rows);
        // Normalised again here: a caller that stands in for the service hands back a bare
        // envelope, and the window must still know what it holds.
        setThreadPage(normaliseThreadPage(res.page, rows));
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          logger.error('Failed to load thread:', err);
          setThreadError('Failed to load thread. Please try again.');
        }
      })
      .finally(() => {
        if (!cancelled) setThreadLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [message.id, threadRefreshKey]);

  /** The page of events before the earliest one on screen, prepended. */
  const loadEarlier = useCallback(() => {
    const before = threadPage?.earliestId;
    if (!threadPage?.hasEarlier || !before || loadingEarlier) return;
    const forId = message.id;
    setLoadingEarlier(true);
    messageService
      .getThreadMessages(forId, { limit: THREAD_PAGE, before })
      .then((res) => {
        if (messageIdRef.current !== forId) return;
        const older = res.data ?? [];
        threadSize.current = { id: forId, loaded: threadSize.current.loaded + older.length };
        setThreadMessages((current) => [...older, ...current]);
        // The older page's own bound says whether there is more before IT; the total is the
        // thread's and does not move.
        setThreadPage((current) => ({
          ...normaliseThreadPage(res.page, older),
          total: current?.total ?? older.length,
        }));
      })
      .catch((err: unknown) => {
        if (messageIdRef.current !== forId) return;
        logger.error('Failed to load earlier messages:', err);
        setThreadError('Could not load earlier messages. Please try again.');
      })
      .finally(() => {
        if (messageIdRef.current === forId) setLoadingEarlier(false);
      });
  }, [message.id, threadPage, loadingEarlier]);

  // ── Sorted thread ──────────────────────────────────────────────────────────

  const sortedThread = useMemo<MessageEvent[]>(() => {
    const msgs = [...threadMessages];
    msgs.sort((ma, mb) => threadTimeOf(ma) - threadTimeOf(mb));
    return msgs;
  }, [threadMessages]);
  // Day separators group by the SAME time the thread is sorted by (threadDays.ts), so one can
  // only ever sit between days, in order.

  // ── Composer state ─────────────────────────────────────────────────────────
  const [composer, setComposer] = useState('');
  // Which AI path produced the text currently in the composer — null when the
  // agent wrote it themselves. Sent with the reply so captured training data
  // records its true author instead of defaulting every reply to "human".
  const [aiSource, setAiSource] = useState<string | null>(null);
  // The AI draft exactly as it was applied to the composer. Sent alongside the
  // reply so the reply_style domain can learn house voice from what the agent
  // CHANGED — an AI-drafted stamp alone says who wrote it, not what was wrong
  // with it.
  const [aiDraft, setAiDraft] = useState<AiDraft | null>(null);
  /**
   * L2 P4 — the note the agent gives the AI draft. Two children share it: the lookup panel adds
   * a record's facts to it, the composer's AI panel is where it is written and sent from.
   * ⛔ Per thread — see the hook, where that rule is the whole reason it exists.
   */
  const aiRecordNote = useAiRecordNote(message.id);

  const handleAiSourceChange = useCallback((source: string | null, draft?: AiDraft) => {
    setAiSource(source);
    setAiDraft(draft ?? null);
  }, []);
  // Clearing the composer discards the AI text, so whatever is typed next is the
  // agent's own. Without this, wiping a draft and writing from scratch would
  // still be reported as AI-drafted — and the discarded draft would be handed to
  // reply_style as if the agent had rewritten it into whatever they type next.
  useEffect(() => {
    if (aiSource !== null && isBlankRichText(composer)) {
      setAiSource(null);
      setAiDraft(null);
    }
  }, [aiSource, composer]);
  const [composerMode, setComposerMode] = useState<'reply' | 'note'>('reply');
  // Refs, not state: two writes inside one render batch must both see the first one's text.
  const latestComposer = useRef(composer);
  latestComposer.current = composer;
  const composerModeRef = useRef(composerMode);
  composerModeRef.current = composerMode;
  // The mode the composer's words were last written in (holdsUnsentNote) — null while blank.
  const lastEditMode = useRef<'reply' | 'note' | null>(null);
  /*
    EVERY composer text write goes through here. Typing counts in the mode on screen; a
    programmatic insert passes the mode it lands in. A write that leaves the visible text as it
    was (TipTap re-normalising the HTML when the other mode's editor mounts) is not an edit, so
    N alone never turns a reply into a note.
  */
  const writeComposer = useCallback(
    (next: React.SetStateAction<string>, landsIn?: 'reply' | 'note') => {
      const prev = latestComposer.current;
      const value = typeof next === 'function' ? next(prev) : next;
      latestComposer.current = value;
      if (isBlankRichText(value)) lastEditMode.current = null;
      else if (landsIn || lastEditMode.current === null || stripHtml(value) !== stripHtml(prev))
        lastEditMode.current = landsIn ?? composerModeRef.current;
      setComposer(value);
    },
    []
  );
  const [submitting, setSubmitting] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);
  const [resolveConfirmOpen, setResolveConfirmOpen] = useState(false);
  const [notCustomerWorkOpen, setNotCustomerWorkOpen] = useState(false);
  // Offered on a finished conversation: "Resolve & Save to KB" captures only while resolving.
  const [promoteToKbOpen, setPromoteToKbOpen] = useState(false);
  const { hasPermission } = usePermissions();
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  // Per-user read/unread state (triage queues only). Optimistically tracked so the
  // header toggle reflects instantly; synced whenever the message prop changes.
  const isTriage = isTriageMessage(message);
  const [readState, setReadState] = useState<boolean>(message.isRead ?? false);
  const [markReadPromptOpen, setMarkReadPromptOpen] = useState(false);
  useEffect(() => {
    setReadState(message.isRead ?? false);
  }, [message.id, message.isRead]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [sendFailedError, setSendFailedError] = useState<string | null>(null);
  // Retry is offered only for a failure a resend can fix, while the draft is still in the
  // composer (SendFailedBar). The async `send_failed` event never sets it: by then the composer
  // was cleared and there is nothing left to resend.
  const [sendFailureRetryable, setSendFailureRetryable] = useState(false);
  // The ownership answer the failed send carried, so Retry does not ask the agent again.
  const lastAssignRef = useRef<ReplyAssignIntent | undefined>(undefined);
  // …and the MODE it was sent in: after a switch to Internal note, "Retry" would otherwise post
  // the failed reply's text as a note — a different action under the same button.
  const lastSendModeRef = useRef<'reply' | 'note'>('reply');
  // Re-render each minute so a window that lapses while the thread is open disables the
  // composer on its own. Without this the agent keeps a stale "open" composer and writes
  // a reply that can no longer be delivered — the failure this feature exists to remove.
  const [windowTick, setWindowTick] = useState(0);
  // Approved-template send, reached only when the 24-hour window has closed. Templates are
  // fetched when the picker OPENS rather than with the conversation: most threads never
  // need them, and a request per opened conversation would buy nothing.
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const richEditorRef = useRef<RichTextEditorHandle>(null);
  const noteEditorRef = useRef<RichTextEditorHandle>(null);
  // M06: idempotency token for the in-flight reply. Minted per logical send, REUSED on a
  // retry after failure (so the BE dedups a duplicate), cleared on success.
  const sendIdempotencyKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!message.whatsappWindow) return;
    const timer = setInterval(() => setWindowTick((tick) => tick + 1), 60_000);
    return () => clearInterval(timer);
  }, [message.whatsappWindow]);

  const composerWindow = useMemo(
    () => resolveComposerWindow(message.whatsappWindow, composerMode),
    // windowTick is a deliberate dependency: it is what makes the countdown advance and
    // the block engage when the window lapses with the view already open. ESLint calls it
    // "unnecessary" precisely BECAUSE the body does not reference it — the 60s tick is the
    // whole point, and removing it freezes the countdown on an open thread. Suppressed
    // rather than left as prose, so the next lint sweep cannot quietly "clean it up".
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
    [message.whatsappWindow, composerMode, windowTick]
  );

  // ── Real-time reply events ─────────────────────────────────────────────────
  useEffect(() => {
    getSocket();
    const handleSendFailed = (data: unknown) => {
      const event = data as { messageId: number; channel: string };
      if (event.messageId === message.id) {
        setSendFailureRetryable(false);
        setSendFailedError(
          `Reply could not be delivered via ${event.channel}. The message was saved but not sent — please try again.`
        );
        // The BE reverts the conv's status and marks the reply event undelivered on
        // failure. Refetch so the thread reflects the real state (no longer shown as
        // resolved/replied, and the outgoing bubble can render as undelivered) instead
        // of the optimistic state from the earlier message:replied event.
        setThreadRefreshKey((key) => key + 1);
        onRefreshRef.current?.();
      }
    };
    const handleReplied = (data: unknown) => {
      const event = data as { messageId: number };
      if (event.messageId === message.id) {
        setThreadRefreshKey((key) => key + 1);
        onRefreshRef.current?.();
      }
    };
    subscribeToEvent('send-failed', handleSendFailed);
    subscribeToEvent('message:replied', handleReplied);
    return () => {
      unsubscribeFromEvent('send-failed', handleSendFailed);
      unsubscribeFromEvent('message:replied', handleReplied);
      releaseSocket();
    };
  }, [message.id]);

  // ── AI ghost state ─────────────────────────────────────────────────────────
  const [aiLoading, setAiLoading] = useState(false);
  // A reply a model wrote before AI drafts were switched off is still stored on the message and
  // nothing server-side can take it back — so it pre-fills the ghost only once the setting is
  // KNOWN to be on (same rule as the AI tab's options).
  const { off: aiDraftsOff, resolved: aiDraftsKnown } = useAiDraftsOff();
  const offerStoredDraft = aiDraftsKnown && !aiDraftsOff;
  const [ghostOption, setGhostOption] = useState<GhostOption | null>(() =>
    offerStoredDraft
      ? toGhostOption(message.metadata?.suggestedAnswer as SuggestedAnswerMeta | undefined)
      : null
  );
  const [alternativeCount, setAlternativeCount] = useState(0);

  // Reset ghost when message changes
  useEffect(() => {
    setGhostOption(
      offerStoredDraft
        ? toGhostOption(message.metadata?.suggestedAnswer as SuggestedAnswerMeta | undefined)
        : null
    );
  }, [message.id, message.metadata, offerStoredDraft]);

  // ── Similar messages dialog ────────────────────────────────────────────────
  const [similarOpen, setSimilarOpen] = useState(false);

  // ── Panel tab state ────────────────────────────────────────────────────────
  const [tab, setTab] = useState<PanelTab>('ai');
  const [panelOpen, setPanelOpen] = useState(false);
  // v3 full page = two columns, but only where there is room for a 312px sidebar; narrower,
  // the page keeps the slide-over layout so nothing is hidden.
  const isWide = useMediaQuery('(min-width: 1024px)');
  const [sideMetaEl, setSideMetaEl] = useState<HTMLDivElement | null>(null);
  const twoColumn = fullPage && isWide;
  // v4 mobile (<640px). Structure that moves on a phone keys on this; pure styling uses `max-sm:`.
  const isPhone = useIsPhone();
  const [highlightAttachmentId, setHighlightAttachmentId] = useState<number | null>(null);
  // Phone scrolling: a new message and a new tab start at their top (usePhoneDetailScroll).
  const detailRootRef = useRef<HTMLDivElement>(null);
  usePhoneDetailScroll(detailRootRef, isPhone && !twoColumn, panelOpen ? tab : 'thread');

  // Reset panel when message changes
  useEffect(() => {
    setPanelOpen(false);
    setTab('ai');
    setHighlightAttachmentId(null);
  }, [message.id]);

  /*
    v4 composer "Look up": open the Lookups tab and bring the Connected systems block into view.
    ⛔ Offered only when the lookup panel itself would render — the SAME cached availability query
    (react-query key shared with CustomApiLookupPanel's thread surface), so this adds no request.
    It fails closed exactly like the panel: loading, error or an older backend ⇒ no button.
  */
  // The SAME gate as the tab itself (useLookupsTab), so the button never points at a hidden tab.
  const lookupAvailable = useLookupsTab('thread').available;
  // An admin can remove the last lookup while an agent sits on its tab; fall back, never blank.
  useEffect(() => {
    if (tab === 'lookups' && !lookupAvailable) setTab('ai');
  }, [tab, lookupAvailable]);
  const lookupFlash = useRef<{
    frame: number | null;
    timer: ReturnType<typeof setTimeout> | null;
    flashed: HTMLElement | null;
  }>({ frame: null, timer: null, flashed: null });
  /*
    ⛔ Cancelling must also take the ring OFF. The lookup panel stays mounted across a thread
    switch and a second press, so a cancelled removal timer would leave the ring on for good.
  */
  const cancelLookupFlash = useCallback(() => {
    const pending = lookupFlash.current;
    if (pending.frame !== null) cancelAnimationFrame(pending.frame);
    if (pending.timer !== null) clearTimeout(pending.timer);
    pending.flashed?.classList.remove(...LOOKUP_FLASH_CLASSES);
    pending.frame = null;
    pending.timer = null;
    pending.flashed = null;
  }, []);
  useEffect(() => cancelLookupFlash, [cancelLookupFlash, message.id]);
  const handleLookUp = useCallback(() => {
    setTab('lookups');
    // The sidebar always shows its content; the slide-over's rail has to be opened.
    if (!twoColumn) setPanelOpen(true);
    cancelLookupFlash();
    /*
      The panel renders after this state commits, and its body can arrive a frame or two later, so
      look for the root over a few frames. `data-lookup-root` sits on CustomApiLookupPanel's root;
      when it is missing (lookup hidden, tab not mounted yet) nothing happens — the tab is open.
    */
    let attempts = 0;
    const seek = () => {
      lookupFlash.current.frame = null;
      const root = document.querySelector<HTMLElement>('[data-lookup-root]');
      if (!root) {
        attempts += 1;
        if (attempts < LOOKUP_SEEK_FRAMES) lookupFlash.current.frame = requestAnimationFrame(seek);
        return;
      }
      root.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
      /*
        …and focus goes there too (the block is focusable, tabIndex -1, named "Connected
        systems"): a screen reader lands on what the press opened, and on a phone — where the
        Lookups tab hides the composer the press came from — focus does not fall to <body>.
        preventScroll: the smooth scroll above already brings it into view.
      */
      root.focus({ preventScroll: true });
      root.classList.add(...LOOKUP_FLASH_CLASSES);
      lookupFlash.current.flashed = root;
      lookupFlash.current.timer = setTimeout(() => {
        root.classList.remove(...LOOKUP_FLASH_CLASSES);
        lookupFlash.current.timer = null;
        lookupFlash.current.flashed = null;
      }, LOOKUP_FLASH_MS);
    };
    lookupFlash.current.frame = requestAnimationFrame(seek);
  }, [twoColumn, cancelLookupFlash]);

  // ── Notes / activity / attachments / lead state ────────────────────────────
  const user = useAuthStore((store) => store.user);
  const currentUserId = user?.id ?? null;

  // Ownership prompt on Send (owner decision 2026-09-07). The workspace setting rides on the
  // organization payload every member may read; cached, one read per session.
  const { data: currentOrganization } = useQuery({
    queryKey: ['current-organization-for-reply', currentUserId],
    queryFn: () => organizationService.getCurrent(),
    staleTime: 5 * 60 * 1000,
    enabled: currentUserId !== null,
  });
  const [assignPrompt, setAssignPrompt] = useState<AssignOnReplyPrompt | null>(null);

  const [notes, setNotes] = useState<MessageNote[]>([]);
  const [messageActivity, setMessageActivity] = useState<MessageActivityEntry[]>([]);
  const [noteActivityLog, setNoteActivityLog] = useState<
    { label: string; who: string; time: string }[]
  >([]);
  const [attachmentsByMessageId, setAttachmentsByMessageId] = useState<Map<number, Attachment[]>>(
    new Map()
  );
  // Lead state — derived from this message + thread. Guarded against a slow answer for the
  // previously opened customer landing here (see useLeadState).
  const [leadState, setLeadState] = useLeadState(message);
  const [leadFieldDefs, setLeadFieldDefs] = useState<LeadQualificationFieldConfig[]>([]);

  // Fetch notes + activity alongside thread refreshes
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      messageService.getNotes(message.id).catch(() => null),
      messageService.getActivity(message.id).catch(() => [] as MessageActivityEntry[]),
    ])
      .then(([notesRes, activity]) => {
        if (cancelled) return;
        if (notesRes && notesRes.success && notesRes.data) setNotes(notesRes.data);
        setMessageActivity(activity);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [message.id, threadRefreshKey]);

  // Fetch attachments for the whole thread (used by the Files tab + thread item attachment chips)
  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<{ success: boolean; data: Attachment[] }>(`/api/messages/${message.id}/attachments`)
      .then((res) => {
        if (cancelled) return;
        const map = new Map<number, Attachment[]>();
        for (const att of res.data.data ?? []) {
          if (att.messageEventId === null) continue;
          const list = map.get(att.messageEventId) ?? [];
          list.push(att);
          map.set(att.messageEventId, list);
        }
        setAttachmentsByMessageId(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [message.id, threadRefreshKey]);

  // Lead config — fetched once
  useEffect(() => {
    organizationService
      .getLeadConfig()
      .then((cfg) => {
        if (cfg.qualificationFields?.length) setLeadFieldDefs(cfg.qualificationFields);
      })
      .catch(() => {});
  }, []);

  // ── Computed flags ─────────────────────────────────────────────────────────
  const spamCheck = getSpamCheck(message);
  void spamCheck;

  const isFiltered = message.status === 'filtered';
  const isSuspicious =
    !isFiltered &&
    (message.metadata?.spamCheck as Record<string, unknown> | undefined)?.category === 'suspicious';
  /**
   * Carries a spam verdict WITHOUT being in one of the triage states that offer a way to undo it.
   *
   * `isSpam: true` with `status: 'open'` is reachable, and it is the worst of both: the verdict
   * hides the conversation from the work queue, the header shows a red SPAM badge, and neither
   * the action strip nor the ACTIONS menu offered anything to correct it. A real customer sat
   * behind that state for a month on a client deployment with no button to press.
   */
  const isSpamFlaggedOutsideTriage =
    !isFiltered &&
    !isSuspicious &&
    (message.metadata?.spamCheck as { isSpam?: boolean } | undefined)?.isSpam === true;
  const isActive =
    !isFiltered && !isSuspicious && !isSpamFlaggedOutsideTriage && message.status !== 'closed';
  // One predicate for the decisions row AND the strip, so the decision can never show
  // in both places or in neither (resolveMode.ts). `hasLinkedTicket` matches the strip's call.
  const resolveMode = getResolveMode(message, {
    isFiltered,
    isSuspicious,
    isSpamFlaggedOutsideTriage,
    hasLinkedTicket: false,
  });
  const ghostVisible = message.status !== 'resolved';

  const autoReply = message.metadata?.autoReply as { sent?: boolean } | undefined;

  // ── Handlers ───────────────────────────────────────────────────────────────

  // Email-only: addressing is meaningless on channels whose transport has no
  // concept of a second recipient, and offering it there would promise something
  // the send path cannot honour.
  const supportsRecipients = message.channel === 'email';
  const [recipientDraft, setRecipientDraft] = useState<RecipientDraft>(emptyRecipientDraft);
  // Merge labels on the timeline + everyone on the thread, for Reply all (owner, 2026-09-23).
  const mergeContext = useThreadMergeContext(message.id, supportsRecipients, threadRefreshKey);

  const performSend = useCallback(
    async (assign?: ReplyAssignIntent) => {
      setSubmitting(true);
      setSendFailedError(null);
      setSendFailureRetryable(false);
      lastAssignRef.current = assign;
      lastSendModeRef.current = composerMode;
      // Notes aren't emails — no idempotency needed. For replies, reuse a prior failed attempt's
      // token (retry) so the BE dedups; otherwise mint a fresh one for this logical send.
      if (composerMode !== 'note' && !sendIdempotencyKeyRef.current) {
        sendIdempotencyKeyRef.current = crypto.randomUUID();
      }
      const idempotencyKey = sendIdempotencyKeyRef.current ?? undefined;
      // Undefined unless the agent actually addressed this reply somewhere, which
      // the BE reads as "the requester and nobody else".
      const recipients = supportsRecipients ? draftToRecipients(recipientDraft) : undefined;
      try {
        if (composerMode === 'note') {
          await messageService.addNote(message.id, composer);
        } else if (selectedFiles.length > 0) {
          await messageService.replyWithAttachments(
            message.id,
            composer,
            selectedFiles,
            false,
            aiSource !== null,
            aiSource ?? undefined,
            idempotencyKey,
            aiDraft ?? undefined,
            recipients,
            assign
          );
        } else {
          await messageService.reply(
            message.id,
            composer,
            false,
            aiSource !== null,
            aiSource ?? undefined,
            idempotencyKey,
            aiDraft ?? undefined,
            undefined,
            recipients,
            assign
          );
        }
        sendIdempotencyKeyRef.current = null; // success — the next send is a new logical send
        writeComposer('');
        setAiSource(null);
        setAiDraft(null);
        setSelectedFiles([]);
        setRecipientDraft(emptyRecipientDraft());
        setThreadRefreshKey((key) => key + 1);
        // A sent reply (not an internal note) flips the conversation to Pending —
        // move the board card optimistically before the heavier onRefresh reconcile.
        if (composerMode !== 'note') onReplied?.();
        onRefresh?.();
      } catch (err) {
        // Keep the token so a retry of THIS send reuses it and the BE dedups the duplicate.
        logger.error('Failed to send:', err);
        // Surface the server's own explanation for client errors — see
        // resolveSendFailureMessage for why "please try again" is wrong for some of them.
        setSendFailedError(resolveSendFailureMessage(err));
        setSendFailureRetryable(isRetryableSendFailure(err));
      } finally {
        setSubmitting(false);
        setAssignPrompt(null);
      }
    },
    [
      aiDraft,
      aiSource,
      composer,
      composerMode,
      message.id,
      onRefresh,
      onReplied,
      recipientDraft,
      selectedFiles,
      supportsRecipients,
      writeComposer,
    ]
  );

  const handleSend = useCallback(async () => {
    // Require real text — blocks Ctrl+Enter attachment-only sends the disabled
    // button can't (empty, whitespace, or markup-only like `<p><br></p>`).
    if (isBlankRichText(composer)) return;
    // A reply (not a note) first asks whether the thread becomes yours — every time on an
    // unowned thread, as a take-over on a colleague's, never on your own. The answer is sent
    // with the reply; the backend applies it.
    if (composerMode !== 'note') {
      const prompt = decideAssignOnReplyPrompt({
        assigneeId: message.assigneeId,
        assigneeName: message.assigneeName,
        currentUserId,
        assignOnReply: readAssignOnReplySetting(currentOrganization),
      });
      if (prompt) {
        setAssignPrompt(prompt);
        return;
      }
    }
    await performSend();
  }, [
    composer,
    composerMode,
    currentOrganization,
    currentUserId,
    message.assigneeId,
    message.assigneeName,
    performSend,
  ]);

  const handleOpenTemplates = useCallback(async () => {
    setTemplateError(null);
    setTemplatesOpen(true);
    setTemplatesLoading(true);
    try {
      setTemplates(await messageService.listWhatsAppTemplates(message.id));
    } finally {
      // The service already swallows a missing endpoint into an empty list, so the picker
      // shows its "nothing approved yet" state rather than an error the agent cannot act on.
      setTemplatesLoading(false);
    }
  }, [message.id]);

  const handleSendTemplate = useCallback(
    async (templateId: number, parameters: string[]) => {
      setSubmitting(true);
      setTemplateError(null);
      // Same idempotency contract as a normal reply: reuse the token on a retry so a
      // success-but-timeout cannot bill the tenant for a second template.
      sendIdempotencyKeyRef.current ??= crypto.randomUUID();
      try {
        await messageService.reply(
          message.id,
          '',
          false,
          false,
          undefined,
          sendIdempotencyKeyRef.current,
          undefined,
          { templateId, parameters }
        );
        sendIdempotencyKeyRef.current = null;
        setTemplatesOpen(false);
        setThreadRefreshKey((key) => key + 1);
        onReplied?.();
        onRefresh?.();
      } catch (err) {
        logger.error('Failed to send WhatsApp template:', err);
        // Shown inside the picker, not as a toast: every refusal here names something the
        // agent can fix in the dialog they are already looking at.
        setTemplateError(resolveSendFailureMessage(err));
      } finally {
        setSubmitting(false);
      }
    },
    [message.id, onRefresh, onReplied]
  );

  const handleResolveWithoutReply = useCallback(async () => {
    setResolving(true);
    try {
      await messageService.resolve(message.id);
      onResolve?.();
    } catch (err) {
      logger.error('Failed to resolve:', err);
    } finally {
      setResolving(false);
    }
  }, [message.id, onResolve]);

  const handleClose = useCallback(async () => {
    setResolving(true);
    try {
      await messageService.close(message.id);
      onResolve?.();
    } catch (err) {
      logger.error('Failed to close:', err);
    } finally {
      setResolving(false);
    }
  }, [message.id, onResolve]);

  // Per-user read/unread (triage). Optimistic with revert on failure; onReadChanged
  // lets the board refresh the unread dot without tearing down the detail.
  const applyRead = useCallback(
    async (next: boolean) => {
      setReadState(next);
      try {
        if (next) await messageService.markRead(message.id);
        else await messageService.markUnread(message.id);
        onReadChanged?.();
      } catch (err) {
        setReadState(!next);
        logger.error('Failed to update read state:', err);
        toast.error(getApiErrorMessage(err) ?? 'Could not update read state');
      }
    },
    [message.id, onReadChanged]
  );

  const handleToggleRead = useCallback(() => {
    void applyRead(!readState);
  }, [applyRead, readState]);

  // Closing an unread triage thread prompts "mark as read?" first (per-user review
  // marker). Read threads, or non-triage threads, close immediately.
  const handleRequestClose = useCallback(() => {
    if (isTriage && !readState) {
      setMarkReadPromptOpen(true);
    } else {
      onClose?.();
    }
  }, [isTriage, readState, onClose]);

  // Expose the prompt-aware close to the parent so out-of-panel close gestures
  // (the backdrop) go through the same "Mark as read?" prompt as the header X.
  // Re-registers whenever the handler identity changes (readState/isTriage), and
  // clears on unmount so a stale handler can't fire against a torn-down panel.
  useEffect(() => {
    onRegisterRequestClose?.(handleRequestClose);
    return () => onRegisterRequestClose?.(null);
  }, [handleRequestClose, onRegisterRequestClose]);

  // One-press Resolve, shared by the header button and the E shortcut so the two can never
  // disagree. It opens the SAME confirm the old footer did (resolveMode.ts) — E never resolves
  // in one keystroke; the dialog is the confirmation (owner decision, 2026-09-22).
  const openResolveDialog = useCallback(() => {
    if (resolveMode === null) return;
    if (noKbResolveDialog(resolveMode) === 'reject') setRejectDialogOpen(true);
    else setCloseConfirmOpen(true);
  }, [resolveMode]);

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
  }, [isPhone, panelOpen, tab]);
  /*
    A lookup record's "Use in reply" is offered always: a record is plain data an agent can state
    to the customer, whether or not AI drafting is available. While the AI note
    can be used it adds to that note, unchanged. When it cannot — the SAME two predicates the
    composer's AI controls hide on (ComposerAiActions: drafts off, no provider; both cached
    queries, so this adds no request) — the ticked sentence goes into the REPLY instead: a new
    paragraph at its end, the composer switched to Reply, shown (phone: back to the Thread tab,
    where the composer lives) and focused. It is the agent's own text, so no AI source is stamped.
  */
  const { aiConfigured } = useAiConfigured();
  const aiNoteUsable = aiConfigured && !aiDraftsOff;
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
    [showComposerForShortcut, writeComposer]
  );
  /*
    ⛔ The panel tabs' mode switch (phone rail / slide-over: any non-Notes tab, Thread, closing a
    tab) never flips an unsent internal note to Reply — the composer holds ONE text, and the flip
    put the note one Send from the customer (and made "Add to my reply" append to it). A blank
    composer still flips. Stable identity, like the setter it wraps; reads the ref, not the state.
  */
  const setPanelComposerMode = useCallback((next: React.SetStateAction<'reply' | 'note'>) => {
    setComposerMode((prev) => {
      const mode = typeof next === 'function' ? next(prev) : next;
      return holdsUnsentNote(latestComposer.current, lastEditMode.current) && mode === 'reply'
        ? prev
        : mode;
    });
  }, []);
  /*
    "Reply to this message" and R: refused (toast, nothing switched, recipients untouched) while an
    internal note is being written. True when refused.
  */
  const refuseReplyOverNote = useCallback((): boolean => {
    if (!holdsUnsentNote(latestComposer.current, lastEditMode.current)) return false;
    toast.info(NOTE_IN_PROGRESS);
    return true;
  }, []);

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

  const applyGhostAnswer = useCallback(
    (answer: string, source: string) => {
      // Suggested answers arrive as plain text with markdown-ish syntax; turn
      // them into HTML so the editor holds editable rich text and the customer
      // receives formatted output instead of literal "**bold**" / "- " runs.
      // Shared with the composer's AI actions via answerToEditorHtml.
      const applied = answerToEditorHtml(answer);
      writeComposer(applied, 'reply');
      setComposerMode('reply');
      // Phone: the answer came from a panel (KB "Use in reply", the AI tab's sources) under which
      // the composer is display:none — go back to the Thread tab, where it shows. Desktop: no-op.
      showComposerForShortcut();
      // Expand the (initially collapsed) reply editor + focus it so the agent
      // sees the populated suggested answer immediately, instead of having to
      // click the editor's expand button first. Deferred so it fires AFTER
      // React mounts the reply editor — if the user was in 'note' mode, the
      // reply ref is null until the conditional render swap settles.
      setTimeout(() => richEditorRef.current?.focus(), 0);
      // Suggested answers arrive from the similar-messages dialog / KB. Record the
      // source, so the send is stamped as AI-drafted rather than reported as the
      // agent's own writing — AND the draft itself, exactly as it was applied to
      // the editor.
      //
      // This used to set the source alone. A send then said "AI-drafted" and
      // carried nothing to compare the sent text against: recordReplyStyleEditEvent
      // returns early on a missing draft, so every reply an agent started from the
      // KB taught reply_style nothing while looking, in every stat we have, exactly
      // like the ones that did. Routed through handleAiSourceChange rather than the
      // two setters so there is ONE place that can set a source without a draft.
      //
      // No `mode`: that field is which compose mode wrote the text, and nothing
      // composed this — it came out of the KB. The provenance travels separately,
      // as suggestedAnswerSource on the send.
      handleAiSourceChange(source || 'suggested_answer', { text: applied });
    },
    [handleAiSourceChange, showComposerForShortcut, writeComposer]
  );
  /*
    A suggested answer (KB "Use in reply", the AI tab's sources, the similar-messages dialog, the
    ghost bubble) REPLACES the composer's text — so it never does that silently:
      - composer blank → inserted, as before;
      - a reply being written → asked first ("Replace your reply with this answer?"); Cancel
        leaves the reply exactly as it was;
      - an internal note being written → untouched, and said so in the lookup path's own words
        (the composer holds ONE text for both modes: switching it to Reply would turn words for
        the team into a message to the customer).
    The ghost bubble only shows over an empty composer, so it always inserts.
  */
  const [pendingGhost, setPendingGhost] = useState<{ answer: string; source: string } | null>(null);
  const handleGhostClick = useCallback(
    (answer: string, source: string, _attachments?: KBAttachment[]) => {
      const current = latestComposer.current;
      if (isBlankRichText(current)) {
        applyGhostAnswer(answer, source);
        return;
      }
      if (holdsUnsentNote(current, lastEditMode.current)) {
        toast.info(NOTE_IN_PROGRESS);
        return;
      }
      setPendingGhost({ answer, source });
    },
    [applyGhostAnswer]
  );

  // `resolving` is set here too (not only on close/resolve): the header button and the
  // shortcuts read it, and this request is just as much in flight after its dialog has closed.
  const handleReject = useCallback(async () => {
    setResolving(true);
    try {
      await messageService.markAsProcessed(message.id);
      onReject?.();
    } catch (err) {
      logger.error('Failed to mark as processed:', err);
    } finally {
      setResolving(false);
    }
  }, [message.id, onReject]);

  /**
   * Bin the thread as not customer work.
   *
   * ⚠️ Failure is SURFACED, unlike the neighbouring `handleReject`, which logs and moves on. The
   * backend refuses this with a 400 in one real case — combining it with a KB save — and a silent
   * failure here would leave the thread in the queue while the agent believes it is gone.
   */
  const handleNotCustomerWork = useCallback(
    async (reason: string) => {
      setResolving(true);
      try {
        await messageService.markAsNotCustomerWork(message.id, reason);
        onReject?.();
      } catch (err) {
        logger.error('Failed to mark as not customer work:', err);
        toast.failure('mark as not customer work', err);
      } finally {
        setResolving(false);
      }
    },
    [message.id, onReject]
  );

  const handleReopen = useCallback(async () => {
    try {
      await messageService.reopen(message.id);
      onReopen?.();
    } catch (err) {
      logger.error('Failed to reopen:', err);
      // Surface the server reason (e.g. a 409 from a non-reopenable state) instead of
      // failing silently — formatError pulls the BE `error` string out of the response.
      toast.failure('reopen message', err);
    }
  }, [message.id, onReopen]);

  const handleClassify = useCallback(
    async (
      action: 'approve' | 'mark_suspicious' | 'move_to_spam' | 'confirm_spam',
      createDetectionRule?: boolean,
      trainSpamFilter?: boolean,
      confirm?: boolean
    ) => {
      if (onClassify) await onClassify(action, createDetectionRule, trainSpamFilter, confirm);
    },
    [onClassify]
  );

  // The host asks before deleting; its success path forgets the thread's similar-results cache
  // (clearing it here, on the press, left Cancel with a cold cache for nothing).
  const handleDelete = useCallback(() => {
    onDelete?.();
  }, [onDelete]);

  const handleRefresh = useCallback(() => {
    setThreadRefreshKey((key) => key + 1);
    onRefresh?.();
  }, [onRefresh]);

  // Contact label edits (from the CUSTOMER tab or the header's contact drawer)
  // change the message's inherited labels but not message.id, so the header's
  // label list won't refetch on its own. Bump a key it depends on, and run the
  // normal refresh so the list/kanban cards pick up the change too.
  const [labelsRefreshKey, setLabelsRefreshKey] = useState(0);
  const handleContactChanged = useCallback(() => {
    setLabelsRefreshKey((key) => key + 1);
    handleRefresh();
  }, [handleRefresh]);

  const handleNoteUpdated = useCallback(
    (noteId: number, content: string) => {
      setNotes((prev) => prev.map((note) => (note.id === noteId ? { ...note, content } : note)));
      setNoteActivityLog((prev) => [
        ...prev,
        {
          label: 'Note edited',
          who: user ? `${user.firstName} ${user.lastName ?? ''}`.trim() : 'Agent',
          time: new Date().toISOString(),
        },
      ]);
    },
    [user]
  );

  const handleNoteDeleted = useCallback(
    (noteId: number) => {
      setNotes((prev) => prev.filter((note) => note.id !== noteId));
      setNoteActivityLog((prev) => [
        ...prev,
        {
          label: 'Note deleted',
          who: user ? `${user.firstName} ${user.lastName ?? ''}`.trim() : 'Agent',
          time: new Date().toISOString(),
        },
      ]);
    },
    [user]
  );

  const handleCheckContradiction = useCallback(async () => {
    await messageService.checkContradiction(message.id);
    setThreadRefreshKey((key) => key + 1);
    onRefresh?.();
  }, [message.id, onRefresh]);

  // ── History banner ─────────────────────────────────────────────────────────
  // The predicate lives in `historyBanner.ts` with the reasoning: it must match the backend's
  // definition of "we did not write this", and it is unit-tested there — every test that renders
  // the page around this component mocks the component itself out.
  const showHistoryBanner = shouldShowHistoryBanner(sortedThread);

  // v3: internal notes sit in the thread at the moment they were written, between the messages
  // they comment on. A stable sort keeps the messages in their own order (a note tied to the
  // millisecond with a message goes after it). Day separators group this merged list, so a
  // separator can only ever sit between days, in order.
  const timeline = useMemo(() => {
    const rows: (
      | { kind: 'message'; time: number; msg: MessageEvent }
      | { kind: 'note'; time: number; note: MessageNote }
    )[] = [
      ...sortedThread.map((msg) => ({ kind: 'message' as const, time: threadTimeOf(msg), msg })),
      ...notes.map((note) => ({ kind: 'note' as const, time: Date.parse(note.createdAt), note })),
    ];
    return rows.sort((left, right) => (left.time || 0) - (right.time || 0));
  }, [sortedThread, notes]);
  const threadDayStarts = useMemo(() => dayStarts(timeline.map((row) => row.time)), [timeline]);

  const flatAttachments = useMemo(
    () => Array.from(attachmentsByMessageId.values()).flat(),
    [attachmentsByMessageId]
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  // Tabbed panel. In the slide-over it sits above the thread and its Thread tab gives the space
  // back; on the wide full page (v3) it is the right sidebar, always showing, beside the thread.
  const panelTabs = (
    <RecordInsertTargetContext.Provider value={aiNoteUsable ? 'note' : 'reply'}>
      <MessagePanelTabs
        /*
          Only while the composer exists (it renders only on an ACTIVE thread). On a closed,
          filtered or suspicious thread there is no reply and no AI note on screen: "Added to your
          reply" would put the sentence into hidden composer state, to surface later if the thread
          reopens. The record cards still show there, without the insert control.
        */
        onUseInReply={isActive ? (aiNoteUsable ? aiRecordNote.add : addRecordToReply) : undefined}
        variant={twoColumn ? 'sidebar' : 'rail'}
        message={message}
        tab={tab}
        setTab={setTab}
        panelOpen={panelOpen}
        setPanelOpen={setPanelOpen}
        notes={notes}
        onNoteUpdated={handleNoteUpdated}
        onNoteDeleted={handleNoteDeleted}
        noteActivityLog={noteActivityLog}
        messageActivity={messageActivity}
        sortedThread={sortedThread}
        threadRefreshKey={threadRefreshKey}
        highlightAttachmentId={highlightAttachmentId}
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
        onRefresh={handleContactChanged}
      />
    </RecordInsertTargetContext.Provider>
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
      // The SAME dialogs the old header split button opened: an unreviewed thread is
      // dismissed through the reject dialog, an active one closes through the no-KB
      // confirm. Nothing new reaches the BE.
      onResolve={openResolveDialog}
      onResolveToKb={() => setResolveConfirmOpen(true)}
      onNotCustomerWork={() => setNotCustomerWorkOpen(true)}
      // Owner, 2026-09-22: the agent resolving AS spam is the CONFIRMED layer.
      onResolveAsSpam={
        onClassify ? () => void onClassify('move_to_spam', undefined, undefined, true) : undefined
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
          onClose={onClose ? handleRequestClose : undefined}
          showFullPageButton={!!onClose && !fullPage}
          isFullPage={fullPage}
          threadCount={threadPage?.total ?? sortedThread.length}
          onRefresh={handleRefresh}
          labelsRefreshKey={labelsRefreshKey}
          onContactChanged={handleContactChanged}
          onDelete={onDelete ? handleDelete : undefined}
          onApprove={onApprove}
          onClassify={onClassify}
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

        {/* Thread view — visible when no panel tab is open.
          ⛔ overflow-x-hidden is deliberate: `overflow-y-auto` alone makes the browser
          compute overflow-x as `auto` too (CSS couples the axes), so one over-wide
          message — an unwrapped <pre> body, a fixed-width email table — turned the
          WHOLE thread into a sideways-scrolling pane that clipped every message
          (ZET-SUP-1358). Wide content is contained per-bubble in ThreadBubble. */}
        <div
          data-testid="thread-scroller"
          className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-background max-sm:flex-none ${panelOpen && !twoColumn ? 'hidden' : ''}`}
        >
          {/* v3: the thread is the canvas; bubbles are the cards on it. */}
          <div className="flex flex-col gap-3.5 px-3.5 py-4 max-sm:gap-3 max-sm:px-3 max-sm:pt-3 max-sm:pb-2">
            {threadLoading && sortedThread.length === 0 && (
              <div className="py-8 text-sm text-center text-muted-foreground">
                <div className="mx-auto mb-2 w-5 h-5 rounded-full border-2 animate-spin border-primary border-t-transparent" />
                Loading thread…
              </div>
            )}
            {threadError && (
              <div className="py-4 text-sm text-center text-destructive">
                {threadError}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setThreadRefreshKey((key) => key + 1)}
                  className="block p-0 mx-auto mt-1 h-auto text-xs underline hover:no-underline"
                >
                  Retry
                </Button>
              </div>
            )}
            {!threadLoading && !threadError && sortedThread.length === 0 && (
              <div className="py-6 text-[12px] text-center text-muted-foreground">
                No messages in thread yet.
              </div>
            )}
            {threadPage?.hasEarlier && (
              <div className="text-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={loadEarlier}
                  isLoading={loadingEarlier}
                  className="px-2 py-1 h-auto text-xs text-muted-foreground"
                >
                  Show earlier messages ({threadPage.total - threadMessages.length} more)
                </Button>
              </div>
            )}
            {timeline.map((row, index) => (
              <Fragment key={row.kind === 'message' ? `m${row.msg.id}` : `n${row.note.id}`}>
                {threadDayStarts.has(index) && (
                  <div
                    role="separator"
                    aria-label={dayLabel(row.time)}
                    className={`flex items-center gap-2.5 text-muted-foreground ${LABEL}`}
                  >
                    <span className="flex-1 h-px bg-border" aria-hidden />
                    <span aria-hidden>{dayLabel(row.time)}</span>
                    <span className="flex-1 h-px bg-border" aria-hidden />
                  </div>
                )}
                {row.kind === 'message' ? (
                  <ThreadMessageItem
                    msg={row.msg}
                    mergedFrom={mergeContext.mergedFromLabel(row.msg)}
                    onReplyTo={
                      supportsRecipients && isActive
                        ? (addresses) => {
                            if (refuseReplyOverNote()) return;
                            setComposerMode('reply');
                            setRecipientDraft((draft) => ({ ...draft, to: addresses.join(', ') }));
                          }
                        : undefined
                    }
                    attachments={attachmentsByMessageId.get(row.msg.id) ?? []}
                    onOpenAttachment={(id) => {
                      setTab('attachments');
                      setPanelOpen(true);
                      setHighlightAttachmentId(id);
                    }}
                  />
                ) : (
                  <ThreadNoteItem note={row.note} />
                )}
              </Fragment>
            ))}

            {/* Ghost bubble — a suggested reply, so only where a reply can be written. */}
            {isActive && (
              <MessageGhostBubble
                aiLoading={aiLoading}
                ghostVisible={ghostVisible}
                ghostOption={ghostOption}
                autoReply={autoReply}
                composer={composer}
                composerMode={composerMode}
                resolved={message.status === 'resolved'}
                alternativeCount={alternativeCount}
                onGhostClick={handleGhostClick}
                onShowAlternatives={() => {
                  setTab('kb');
                  setPanelOpen(true);
                }}
              />
            )}
          </div>
        </div>

        {/* Phone: the resolve row between the thread and the composer, Thread tab only (M6) — and,
            as on desktop, only while the composer is on Reply: a note is not an answer. */}
        {isPhone && isActive && !panelOpen && composerMode === 'reply' && decisionsFor('phone')}

        {/* Composer — shown for active conversations. On a phone, only under the Thread or Notes
            tab (M7) — hidden, not unmounted, so a draft and its AI undo survive a tab visit. */}
        {isActive && (
          <MessageComposer
            hidden={isPhone && panelOpen && tab !== 'notes'}
            shortcutHint={shortcutHint(shortcutContext)}
            message={message}
            composer={composer}
            setComposer={writeComposer}
            composerMode={composerMode}
            setComposerMode={setComposerMode}
            submitting={submitting}
            onSend={() => void handleSend()}
            richEditorRef={richEditorRef}
            noteEditorRef={noteEditorRef}
            onOpenSimilarMessages={() => setSimilarOpen(true)}
            aiNote={aiRecordNote.note}
            onAiNoteChange={aiRecordNote.change}
            aiNoteReveal={aiRecordNote.reveal}
            onLookUp={lookupAvailable ? handleLookUp : null}
            selectedFiles={selectedFiles}
            onFilesChange={setSelectedFiles}
            onAiSourceChange={handleAiSourceChange}
            sendBlockedReason={composerWindow.blocked ? composerWindow.notice : null}
            windowRemaining={composerWindow.remaining}
            windowTone={composerWindow.tone}
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
            recipientDraft={supportsRecipients ? recipientDraft : undefined}
            onRecipientDraftChange={supportsRecipients ? setRecipientDraft : undefined}
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

      <WhatsAppTemplatePicker
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
        templates={templates}
        loading={templatesLoading}
        sending={submitting}
        error={templateError}
        onSend={(templateId, parameters) => void handleSendTemplate(templateId, parameters)}
      />

      <PromoteToKbDialog
        messageId={message.id}
        isOpen={promoteToKbOpen}
        onClose={() => setPromoteToKbOpen(false)}
        onPromoted={handleRefresh}
      />

      {/* Confirm dialogs */}
      <AssignOnReplyDialog
        prompt={assignPrompt}
        sending={submitting}
        onChoose={(assign) => void performSend(assign)}
        onCancel={() => setAssignPrompt(null)}
      />
      <MessageDetailConfirmDialogs
        message={message}
        rejectDialogOpen={rejectDialogOpen}
        setRejectDialogOpen={setRejectDialogOpen}
        reopenDialogOpen={reopenDialogOpen}
        setReopenDialogOpen={setReopenDialogOpen}
        resolveConfirmOpen={resolveConfirmOpen}
        notCustomerWorkOpen={notCustomerWorkOpen}
        setNotCustomerWorkOpen={setNotCustomerWorkOpen}
        onNotCustomerWork={handleNotCustomerWork}
        setResolveConfirmOpen={setResolveConfirmOpen}
        closeConfirmOpen={closeConfirmOpen}
        setCloseConfirmOpen={setCloseConfirmOpen}
        markReadPromptOpen={markReadPromptOpen}
        setMarkReadPromptOpen={setMarkReadPromptOpen}
        onReject={handleReject}
        onReopen={handleReopen}
        onResolveToKB={handleResolveWithoutReply}
        onCloseThread={handleClose}
        onMarkReadAndClose={async () => {
          // Await the mark-read so a failure surfaces (toast + revert) while the
          // panel is still mounted, rather than as an orphaned toast post-close.
          await applyRead(true);
          onClose?.();
        }}
        onKeepUnreadAndClose={() => onClose?.()}
      />

      <ConfirmDialog
        open={pendingGhost !== null}
        onOpenChange={(open) => {
          if (!open) setPendingGhost(null);
        }}
        onConfirm={() => {
          if (pendingGhost) applyGhostAnswer(pendingGhost.answer, pendingGhost.source);
        }}
        title="Replace your reply with this answer?"
        description="What you have written so far will be replaced."
        confirmText="Replace"
        variant="warning"
      />

      {/* Similar messages dialog */}
      {similarOpen && (
        <SimilarMessagesDialog
          messageId={message.id}
          open={similarOpen}
          onClose={() => setSimilarOpen(false)}
          onSelectAnswer={(answer, source) => {
            handleGhostClick(answer, source ?? '');
            setSimilarOpen(false);
          }}
        />
      )}
    </div>
  );
}
