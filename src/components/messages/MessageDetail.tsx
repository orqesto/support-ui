// Over the 650-line cap — same pattern as MessageDetailHeader. The per-user
// read/unread toggle + close prompt pushed it over; splitting the confirm-dialog
// wiring out is the natural follow-up refactor.
/* eslint-disable max-lines */
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  draftToRecipients,
  emptyRecipientDraft,
  type RecipientDraft,
} from './RecipientFields';
import {
  messageService,
  type AiDraft,
  type MessageNote,
  type MessageActivityEntry,
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
import type { Message, MessageEvent } from '@/types';
import { MessageDetailHeader } from './MessageDetailHeader';
import { MessageComposer } from './MessageComposer';
import { MessageActionStrip } from './MessageActionStrip';
import { MessageGhostBubble } from './MessageGhostBubble';
import { MessageDetailConfirmDialogs } from './MessageDetailConfirmDialogs';
import { ThreadMessageItem } from './ThreadMessageItem';
import { similarResultsCache } from './AiTabPanel';
import type { KBAttachment } from './AiTabPanel';
import { MessagePanelTabs } from './MessagePanelTabs';
import type { Attachment } from './MessageAttachments';
import type { LeadQualificationPanel } from '@/components/tickets/LeadQualificationPanel';
import { SimilarMessagesDialog } from '@/components/modals/SimilarMessagesDialog';
import { Button } from '@/components/ui/Button';
import { logger } from '@/lib/logger';
import { resolveSendFailureMessage } from '@/components/messages/sendErrorMessage';
import { resolveComposerWindow } from '@/components/messages/whatsappWindowState';
import { WhatsAppTemplatePicker } from '@/components/messages/WhatsAppTemplatePicker';
import type { WhatsAppTemplate } from '@/components/messages/whatsappTemplates';
import { isBlankRichText } from '@/lib/stripHtml';
import { toast } from '@/lib/toast';
import type { RichTextEditorHandle } from '@/components/shared/RichTextEditor';
import {
  toGhostOption,
  answerToEditorHtml,
  type GhostOption,
  type SuggestedAnswerMeta,
} from './messageDetailConstants';

type LeadState = Parameters<typeof LeadQualificationPanel>[0]['leadState'];
type PanelTab =
  | 'ai'
  | 'customer'
  | 'attachments'
  | 'kb'
  | 'activity'
  | 'notes'
  | 'lead'
  | 'contradiction';

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
  /** Fired after a customer reply is sent (not notes) — the conversation flips to
   *  "Pending" (awaiting the customer), letting the board move the card optimistically. */
  onReplied?: () => void;
  /** Optimistically move the board card to a column after a manual status change
   *  (park / resolve / reopen) from the detail header. */
  onOptimisticMove?: (columnId: string) => void;
  onClassify?: (
    action: 'approve' | 'mark_suspicious' | 'move_to_spam',
    createDetectionRule?: boolean,
    trainSpamFilter?: boolean
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

  useEffect(() => {
    let cancelled = false;
    setThreadLoading(true);
    setThreadError(null);
    messageService
      .getThreadMessages(message.id)
      .then((res) => {
        if (!cancelled) setThreadMessages(res.data ?? []);
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

  // ── Sorted thread ──────────────────────────────────────────────────────────

  const sortedThread = useMemo<MessageEvent[]>(() => {
    const msgs = [...threadMessages];
    const msgTime = (msg: MessageEvent) =>
      new Date(
        msg.sentAt ?? (msg.metadata as { receivedAt?: string } | null)?.receivedAt ?? msg.createdAt
      ).getTime();
    msgs.sort((ma, mb) => msgTime(ma) - msgTime(mb));
    return msgs;
  }, [threadMessages]);

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
  const [submitting, setSubmitting] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);
  const [resolveConfirmOpen, setResolveConfirmOpen] = useState(false);
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
  const [ghostOption, setGhostOption] = useState<GhostOption | null>(() =>
    toGhostOption(message.metadata?.suggestedAnswer as SuggestedAnswerMeta | undefined)
  );
  const [alternativeCount, setAlternativeCount] = useState(0);

  // Reset ghost when message changes
  useEffect(() => {
    setGhostOption(
      toGhostOption(message.metadata?.suggestedAnswer as SuggestedAnswerMeta | undefined)
    );
  }, [message.id, message.metadata]);

  // ── Similar messages dialog ────────────────────────────────────────────────
  const [similarOpen, setSimilarOpen] = useState(false);

  // ── Panel tab state ────────────────────────────────────────────────────────
  const [tab, setTab] = useState<PanelTab>('ai');
  const [panelOpen, setPanelOpen] = useState(false);
  const [highlightAttachmentId, setHighlightAttachmentId] = useState<number | null>(null);

  // Reset panel when message changes
  useEffect(() => {
    setPanelOpen(false);
    setTab('ai');
    setHighlightAttachmentId(null);
  }, [message.id]);

  // ── Notes / activity / attachments / lead state ────────────────────────────
  const user = useAuthStore((store) => store.user);
  const currentUserId = user?.id ?? null;

  const [notes, setNotes] = useState<MessageNote[]>([]);
  const [messageActivity, setMessageActivity] = useState<MessageActivityEntry[]>([]);
  const [noteActivityLog, setNoteActivityLog] = useState<
    { label: string; who: string; time: string }[]
  >([]);
  const [attachmentsByMessageId, setAttachmentsByMessageId] = useState<Map<number, Attachment[]>>(
    new Map()
  );
  const [leadState, setLeadState] = useState<LeadState | null>(null);
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

  // Lead state — derived from this message + thread
  useEffect(() => {
    if (!message.isLead) {
      setLeadState(null);
      return;
    }
    const ownState = message.metadata?.leadState as LeadState | undefined;
    if (ownState) setLeadState(ownState);
    messageService
      .getThreadMessages(message.id)
      .then((res) => {
        const sorted = [...(res.data ?? [])].sort((itemA, itemB) => itemB.id - itemA.id);
        for (const msg of sorted) {
          const stat = (msg.metadata as { leadState?: LeadState } | null)?.leadState;
          if (stat) {
            setLeadState(stat);
            return;
          }
        }
        const fb = message.metadata?.leadState as LeadState | undefined;
        setLeadState(fb ?? null);
      })
      .catch(() => {
        const fb = message.metadata?.leadState as LeadState | undefined;
        setLeadState(fb ?? null);
      });
  }, [message.id, message.isLead, message.metadata]);

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
  const ghostVisible = message.status !== 'resolved';

  const autoReply = message.metadata?.autoReply as { sent?: boolean } | undefined;

  // ── Handlers ───────────────────────────────────────────────────────────────

  // Email-only: addressing is meaningless on channels whose transport has no
  // concept of a second recipient, and offering it there would promise something
  // the send path cannot honour.
  const supportsRecipients = message.channel === 'email';
  const [recipientDraft, setRecipientDraft] = useState<RecipientDraft>(emptyRecipientDraft);

  const handleSend = useCallback(async () => {
    // Require real text — blocks Ctrl+Enter attachment-only sends the disabled
    // button can't (empty, whitespace, or markup-only like `<p><br></p>`).
    if (isBlankRichText(composer)) return;
    setSubmitting(true);
    setSendFailedError(null);
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
          recipients
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
          recipients
        );
      }
      sendIdempotencyKeyRef.current = null; // success — the next send is a new logical send
      setComposer('');
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
    } finally {
      setSubmitting(false);
    }
  }, [aiDraft, aiSource, composer, composerMode, message.id, onRefresh, onReplied, recipientDraft, selectedFiles, supportsRecipients]);

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
        toast.error('Could not update read state');
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

  const handleGhostClick = useCallback(
    (answer: string, source: string, _attachments?: KBAttachment[]) => {
      // Suggested answers arrive as plain text with markdown-ish syntax; turn
      // them into HTML so the editor holds editable rich text and the customer
      // receives formatted output instead of literal "**bold**" / "- " runs.
      // Shared with the composer's AI actions via answerToEditorHtml.
      setComposer(answerToEditorHtml(answer));
      setComposerMode('reply');
      // Expand the (initially collapsed) reply editor + focus it so the agent
      // sees the populated suggested answer immediately, instead of having to
      // click the editor's expand button first. Deferred so it fires AFTER
      // React mounts the reply editor — if the user was in 'note' mode, the
      // reply ref is null until the conditional render swap settles.
      setTimeout(() => richEditorRef.current?.focus(), 0);
      // Suggested answers arrive from the similar-messages dialog / KB. Record
      // the source so the send is stamped as AI-drafted rather than reported as
      // the agent's own writing.
      setAiSource(source || 'suggested_answer');
    },
    []
  );

  const handleReject = useCallback(async () => {
    try {
      await messageService.markAsProcessed(message.id);
      onReject?.();
    } catch (err) {
      logger.error('Failed to mark as processed:', err);
    }
  }, [message.id, onReject]);

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
      action: 'approve' | 'mark_suspicious' | 'move_to_spam',
      createDetectionRule?: boolean,
      trainSpamFilter?: boolean
    ) => {
      if (onClassify) await onClassify(action, createDetectionRule, trainSpamFilter);
    },
    [onClassify]
  );

  const handleDelete = useCallback(() => {
    similarResultsCache.delete(message.id);
    onDelete?.();
  }, [message.id, onDelete]);

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
  const showHistoryBanner = sortedThread.length > 0 && sortedThread[0].type !== 'inbound';

  const flatAttachments = useMemo(
    () => Array.from(attachmentsByMessageId.values()).flat(),
    [attachmentsByMessageId]
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Header */}
      <MessageDetailHeader
        message={message}
        onClose={onClose ? handleRequestClose : undefined}
        showFullPageButton={!!onClose && !fullPage}
        isFullPage={fullPage}
        threadCount={sortedThread.length}
        onRefresh={handleRefresh}
        labelsRefreshKey={labelsRefreshKey}
        onContactChanged={handleContactChanged}
        onDelete={handleDelete}
        onApprove={onApprove}
        onClassify={onClassify}
        onOptimisticMove={onOptimisticMove}
        showReadToggle={isTriage}
        isRead={readState}
        onToggleRead={handleToggleRead}
      />

      {/* History banner */}
      {showHistoryBanner && (
        <div className="flex-shrink-0 px-4 py-1.5 text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border-b border-amber-200 dark:border-amber-800">
          This thread starts with an outbound message — older history may be missing.
        </div>
      )}

      {/* Tabbed panel: Thread tab closes the panel; other tabs show their content above the thread */}
      <MessagePanelTabs
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
        onGhostClick={handleGhostClick}
        // Passed as the setters themselves: React guarantees a stable identity for a
        // useState setter, while the inline arrows they replace were a NEW function on
        // every render. AiTabPanel's fetch effect can only declare these as honest
        // dependencies if they hold still.
        onOptionsLoaded={setAlternativeCount}
        onAiLoadingChange={setAiLoading}
        setComposerMode={setComposerMode}
        noteEditorRef={noteEditorRef}
        onCheckContradiction={handleCheckContradiction}
        onRefresh={handleContactChanged}
      />

      {/* Thread view — visible when no panel tab is open */}
      <div className={`flex-1 min-h-0 overflow-y-auto ${panelOpen ? 'hidden' : ''}`}>
        <div className="px-4 py-3 space-y-3">
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
                className="block mx-auto mt-1 p-0 h-auto text-xs underline hover:no-underline"
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
          {sortedThread.map((msg) => (
            <ThreadMessageItem
              key={msg.id}
              msg={msg}
              attachments={attachmentsByMessageId.get(msg.id) ?? []}
              onOpenAttachment={(id) => {
                setTab('attachments');
                setPanelOpen(true);
                setHighlightAttachmentId(id);
              }}
            />
          ))}

          {/* Ghost bubble */}
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
        </div>
      </div>

      {/* Send failure alert — shown when BE confirms delivery failed */}
      {sendFailedError && (
        <div className="mx-4 p-3 text-sm rounded-md text-destructive bg-destructive/10 flex justify-between items-start gap-2">
          <span>{sendFailedError}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Dismiss"
            onClick={() => setSendFailedError(null)}
            className="p-0 w-auto h-auto shrink-0 text-destructive/70 hover:text-destructive"
          >
            ✕
          </Button>
        </div>
      )}

      {/* Composer — shown for active conversations */}
      {isActive && (
        <MessageComposer
          message={message}
          composer={composer}
          setComposer={setComposer}
          composerMode={composerMode}
          setComposerMode={setComposerMode}
          submitting={submitting}
          onSend={() => void handleSend()}
          richEditorRef={richEditorRef}
          noteEditorRef={noteEditorRef}
          onOpenSimilarMessages={() => setSimilarOpen(true)}
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
          recipientDraft={supportsRecipients ? recipientDraft : undefined}
          onRecipientDraftChange={supportsRecipients ? setRecipientDraft : undefined}
        />
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

      {/* Action strip */}
      <MessageActionStrip
        message={message}
        isFiltered={isFiltered}
        isSuspicious={isSuspicious}
        isSpamFlaggedOutsideTriage={isSpamFlaggedOutsideTriage}
        isActive={isActive}
        resolving={resolving}
        hasLinkedTicket={false}
        onReopen={handleReopen}
        onDelete={handleDelete}
        onClassify={handleClassify}
        onResolveWithoutReply={() => setResolveConfirmOpen(true)}
        onClose={() => setCloseConfirmOpen(true)}
        setRejectDialogOpen={setRejectDialogOpen}
        setReopenDialogOpen={setReopenDialogOpen}
        onRefresh={handleRefresh}
      />
      {/* Confirm dialogs */}
      <MessageDetailConfirmDialogs
        message={message}
        rejectDialogOpen={rejectDialogOpen}
        setRejectDialogOpen={setRejectDialogOpen}
        reopenDialogOpen={reopenDialogOpen}
        setReopenDialogOpen={setReopenDialogOpen}
        resolveConfirmOpen={resolveConfirmOpen}
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
