import { useCallback, useRef, useState, type MutableRefObject } from 'react';
import { messageService, type ReplyAssignIntent } from '@/services/message.service';
import type { organizationService } from '@/services/organization.service';
import { forgetOwnSend, rememberOwnSend } from '@/lib/ownSends';
import { logger } from '@/lib/logger';
import { noteFromEditor } from '@/lib/noteText';
import { toast } from '@/lib/toast';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { isBlankRichText } from '@/lib/stripHtml';
import type { Message } from '@/types';
import { draftToRecipients, emptyRecipientDraft, type RecipientDraft } from '../RecipientFields';
import {
  decideAssignOnReplyPrompt,
  readAssignOnReplySetting,
  type AssignOnReplyPrompt,
} from '../assignOnReplyPrompt';
import {
  isRetryableSendFailure,
  resolveSendFailureMessage,
} from '@/features/messages/components/sendErrorMessage';
import { replyCollisionQuestion } from '@/lib/apiError';
import { writeSendAction, type SendAction } from '../ComposerSendButton';
import type { ResolveMode } from '../resolveMode';
import { fileIdentity, keyForPayload } from './sendKey';
import type { UnsentDraftSend } from '@/hooks/useUnsentDraft';
import type { MessageDetailProps, Setter } from './types';
import type { useComposerText } from './useComposerText';
import type { useDetailDialogs } from './useDetailDialogs';
import type { useReplyComposerState } from './useReplyComposerState';
import type { useThreadEvents } from './useThreadEvents';

/** Sending: the reply / note itself, Send ▾ and its after-send step, and WhatsApp templates. */

export function useReplySend({
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
  beginDraftSend,
}: {
  /** The kept unsent text's send (useThreadUnsentDraft): settled whether or not the thread is open. */
  beginDraftSend: () => UnsentDraftSend;
  message: Message;
  composerText: ReturnType<typeof useComposerText>;
  dialogs: ReturnType<typeof useDetailDialogs>;
  replyState: ReturnType<typeof useReplyComposerState>;
  thread: ReturnType<typeof useThreadEvents>;
  supportsRecipients: boolean;
  recipientDraft: RecipientDraft;
  setRecipientDraft: Setter<RecipientDraft>;
  afterSendRef: MutableRefObject<{ action: SendAction; hold?: { reason: string; until: Date } }>;
  setSendHoldOpen: Setter<boolean>;
  setSendAction: Setter<SendAction>;
  setAssignPrompt: Setter<AssignOnReplyPrompt | null>;
  currentUserId: number | null;
  currentOrganization: Awaited<ReturnType<typeof organizationService.getCurrent>> | undefined;
  resolveMode: ResolveMode;
} & Pick<MessageDetailProps, 'onReplied' | 'onResolve' | 'onOptimisticMove' | 'onRefresh'>) {
  const { composer, composerMode, aiSource, setAiSource, aiDraft, setAiDraft, writeComposer } =
    composerText;
  const { setSubmitting } = dialogs;
  const {
    selectedFiles,
    setSelectedFiles,
    setSendFailedError,
    setSendFailureRetryable,
    lastAssignRef,
    lastSendModeRef,
    sendIdempotencyKeyRef,
    templateIdempotencyKeyRef,
    setTemplateError,
    setTemplatesOpen,
    setTemplatesLoading,
    setTemplates,
  } = replyState;
  const { setNotesBump, setThreadRefreshKey, pullNewEvents, threadMessages, threadEventsFor } =
    thread;
  /*
    Thread presence send guard (spec §5.4): the newest event the agent has loaded rides on the
    reply; none loaded — or the loaded ones belong to the thread shown before (a switch whose events
    have not landed yet) — ⇒ omitted, the old-client path the server does not guard. Not filtered
    by event.conversationId: a merged thread's events carry the absorbed threads' ids. A 409 saying
    someone got there first opens a confirm (`collision`, the server's question verbatim) instead
    of the Send failed bar.
  */
  const seenLastEventId =
    threadMessages.length > 0 && threadEventsFor === message.id
      ? threadMessages.reduce((max, event) => Math.max(max, event.id), threadMessages[0].id)
      : undefined;
  const [collision, setCollision] = useState<string | null>(null);
  const collisionRef = useRef<string | null>(null);
  const showCollision = useCallback((question: string | null) => {
    collisionRef.current = question;
    setCollision(question);
  }, []);
  const performSend = useCallback(
    async (assign?: ReplyAssignIntent, confirmOverride = false) => {
      setSubmitting(true);
      setSendFailedError(null);
      setSendFailureRetryable(false);
      lastAssignRef.current = assign;
      lastSendModeRef.current = composerMode;
      // Undefined unless the agent actually addressed this reply somewhere, which
      // the BE reads as "the requester and nobody else".
      const recipients = supportsRecipients ? draftToRecipients(recipientDraft) : undefined;
      // Send ▾: "Send, resolve & save to KB" rides on the reply itself — the server resolves and
      // captures the Q&A in the reply's own transaction, and reverts both if delivery fails.
      // The other choices run after the reply is out.
      const after = afterSendRef.current;
      afterSendRef.current = { action: 'send' };
      const resolveInSend = composerMode !== 'note' && after.action === 'resolve_kb';
      // Notes aren't emails — no idempotency needed, and a note must not read, register or clear
      // the reply's token: one kept from a failed reply has to survive the note so that reply's
      // retry still dedups. A reply reuses a failed attempt's token only when it delivers the SAME
      // email — body, files, recipients (a retry, so the BE dedups); any other reply mints its own:
      // with the old token the BE would answer with the earlier send and this one would never go
      // out. The assign / resolve flags stay out: a send that landed despite the error re-reads the
      // thread as assigned, so re-pressing Send carries no assign answer — and must still dedup.
      const idempotencyKey =
        composerMode === 'note'
          ? undefined
          : keyForPayload(
              sendIdempotencyKeyRef,
              JSON.stringify([
                composer,
                selectedFiles.map(fileIdentity),
                recipients?.to ?? [],
                recipients?.cc ?? [],
                recipients?.bcc ?? [],
              ])
            );
      // Not in the key's payload above: "Send anyway" is the same reply, so it keeps the key.
      const guard =
        seenLastEventId === undefined && !confirmOverride
          ? undefined
          : {
              ...(seenLastEventId !== undefined && { seenLastEventId }),
              ...(confirmOverride && { confirmOverride: true }),
            };
      // Before the request: the `message:replied` echo can beat the HTTP answer.
      if (idempotencyKey) rememberOwnSend(idempotencyKey);
      // After the key is minted: the kept copy rides with it while the send is out.
      const draftSend = beginDraftSend();
      try {
        if (composerMode === 'note') {
          // The composer is the rich-text editor; a note is plain text (noteText.ts).
          await messageService.addNote(message.id, noteFromEditor(composer));
        } else if (selectedFiles.length > 0) {
          await messageService.replyWithAttachments(
            message.id,
            composer,
            selectedFiles,
            resolveInSend,
            aiSource !== null,
            aiSource ?? undefined,
            idempotencyKey,
            aiDraft ?? undefined,
            recipients,
            assign,
            guard
          );
        } else {
          await messageService.reply(
            message.id,
            composer,
            resolveInSend,
            aiSource !== null,
            aiSource ?? undefined,
            idempotencyKey,
            aiDraft ?? undefined,
            undefined,
            recipients,
            assign,
            guard
          );
        }
        // success — the next reply is a new logical send
        if (composerMode !== 'note') sendIdempotencyKeyRef.current = null;
        // Out: never "unsent" again, even when the agent already left the thread.
        draftSend.settle(true);
        writeComposer('');
        setAiSource(null);
        setAiDraft(null);
        setSelectedFiles([]);
        setRecipientDraft(emptyRecipientDraft());
        /*
          Read only what the send changed — not the whole thread and every panel (6 GETs):
           - a note: the notes. It adds no event and no activity entry (its audit row is the
             note's own), and nothing on the list or the board shows it — so no onRefresh below.
           - a reply: the events after the newest on screen (the reply itself), its activity entry
             (`message.reply`, and any resolve / hold that rode with it), the files when files
             were sent, and whom it went to when the agent addressed it.
          A failed send keeps its full re-read (the catch below).
        */
        if (composerMode === 'note') setNotesBump((key) => key + 1);
        else
          pullNewEvents({
            activity: true,
            attachments: selectedFiles.length > 0,
            // {} when nobody was addressed — "the requester and nobody else".
            participants: recipients !== undefined && Object.keys(recipients).length > 0,
          });
        // A sent reply (not an internal note) flips the conversation to Pending —
        // move the board card optimistically before the heavier onRefresh reconcile.
        if (composerMode !== 'note') onReplied?.();
        if (resolveInSend) onResolve?.();
        else if (composerMode !== 'note' && after.action !== 'send') {
          try {
            if (after.action === 'resolve') await messageService.close(message.id);
            else if (after.action === 'hold' && after.hold) {
              await messageService.setStatus(message.id, 'pending', after.hold);
              onOptimisticMove?.('on_hold');
            }
            if (after.action !== 'hold') onResolve?.();
          } catch (err) {
            // The reply IS out — only the status step failed; say so instead of a send failure.
            // A toast, not the send-failure bar: that bar is titled "Send failed", and the reply
            // DID go out.
            logger.error('Sent, but the status change failed:', err);
            // With the server's own reason when it gave one (errorShape rule).
            const reason = getApiErrorMessage(err);
            toast.error(
              after.action === 'hold'
                ? `Reply sent — but putting it on hold failed${reason ? `: ${reason}` : ''}. Put it on hold from the status menu.`
                : `Reply sent — but resolving failed${reason ? `: ${reason}` : ''}. Resolve it from the Resolve row.`
            );
          }
        }
        // The reply moved the conversation (Pending, an assignee, a resolve): the page re-reads it.
        if (composerMode !== 'note') onRefresh?.();
      } catch (err) {
        draftSend.settle(false);
        // Keep the token so a retry of THIS send reuses it and the BE dedups the duplicate —
        // and its Send ▾ choice, so Retry resolves / holds as the agent asked.
        afterSendRef.current = after;
        // Should the server have delivered it after all, its echo must reload like anyone's.
        if (idempotencyKey) forgetOwnSend(idempotencyKey);
        // Someone got there first: nothing was sent. The agent decides — Send anyway or Cancel
        // (which re-reads the thread so the newer reply shows); not a send failure.
        const question = composerMode === 'note' ? null : replyCollisionQuestion(err);
        if (question !== null) {
          showCollision(question);
          return;
        }
        // …and the echo may already have come and been skipped as ours: the server emits it before
        // it answers, so a reply delivered whose ANSWER was lost (a dropped connection, a 502 from
        // the proxy) would never show. Re-read as the echo would have.
        if (lastSendModeRef.current !== 'note') {
          setThreadRefreshKey((key) => key + 1);
          onRefresh?.();
        }
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
      onOptimisticMove,
      onRefresh,
      onReplied,
      onResolve,
      pullNewEvents,
      recipientDraft,
      seenLastEventId,
      showCollision,
      selectedFiles,
      supportsRecipients,
      writeComposer,
      beginDraftSend,
      afterSendRef,
      lastAssignRef,
      lastSendModeRef,
      sendIdempotencyKeyRef,
      setAiDraft,
      setAiSource,
      setAssignPrompt,
      setNotesBump,
      setRecipientDraft,
      setSelectedFiles,
      setSendFailedError,
      setSendFailureRetryable,
      setSubmitting,
      setThreadRefreshKey,
    ]
  );

  /** The confirm's "Send anyway": the same reply, its kept key, the override flag. */
  const sendAnyway = useCallback(() => {
    if (collisionRef.current === null) return;
    showCollision(null);
    void performSend(lastAssignRef.current, true);
  }, [lastAssignRef, performSend, showCollision]);
  /** Cancel (or the dialog closed): the draft stays as it was; the thread is read again. */
  const cancelCollision = useCallback(() => {
    if (collisionRef.current === null) return;
    showCollision(null);
    setThreadRefreshKey((key) => key + 1);
    onRefresh?.();
  }, [onRefresh, setThreadRefreshKey, showCollision]);

  const handleSend = useCallback(async () => {
    // Require real text — blocks Ctrl+Shift+Enter attachment-only sends the disabled
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
    setAssignPrompt,
  ]);

  // Resolving rides on any thread the Resolve row could resolve — an UNREVIEWED one too: its
  // "dismiss without a reply" meaning is the row's, and a send IS the reply, so there is an answer
  // to resolve on (and to save to the KB). The row hides while a reply is typed, so leaving these
  // out left a new thread with a draft no way to resolve at all (owner, 2026-11-03). Hold always.
  const sendActions: SendAction[] =
    resolveMode !== null ? ['send', 'resolve', 'resolve_kb', 'hold'] : ['send', 'hold'];
  // Sends with an action WITHOUT remembering it: the Send ▾ face, which already shows the choice.
  const handleSendWith = useCallback(
    (action: SendAction) => {
      if (isBlankRichText(composer)) return;
      // On hold needs its reason and recheck date first — asked BEFORE anything is sent.
      if (action === 'hold') {
        setSendHoldOpen(true);
        return;
      }
      afterSendRef.current = { action };
      void handleSend();
    },
    [composer, handleSend, afterSendRef, setSendHoldOpen]
  );
  const rememberSendAction = useCallback(
    (action: SendAction) => {
      setSendAction(action);
      writeSendAction(currentUserId ?? undefined, action);
    },
    [currentUserId, setSendAction]
  );
  // A Send ▾ menu pick: the agent's choice. Remembered as the face — On hold only once its dialog
  // is confirmed, so a cancelled hold does not turn every later Send into a hold dialog.
  const handleSendPick = useCallback(
    (action: SendAction) => {
      if (action !== 'hold') rememberSendAction(action);
      handleSendWith(action);
    },
    [handleSendWith, rememberSendAction]
  );

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
  }, [message.id, setTemplateError, setTemplates, setTemplatesLoading, setTemplatesOpen]);

  const handleSendTemplate = useCallback(
    async (templateId: number, parameters: string[]) => {
      setSubmitting(true);
      setTemplateError(null);
      // Same idempotency contract as a normal reply: reuse the token on a retry of the SAME
      // template and parameters so a success-but-timeout cannot bill the tenant for a second one;
      // another template or other parameters get their own. Never the text reply's token
      // (templateIdempotencyKeyRef).
      const idempotencyKey = keyForPayload(
        templateIdempotencyKeyRef,
        JSON.stringify([templateId, parameters])
      );
      try {
        await messageService.reply(
          message.id,
          '',
          false,
          false,
          undefined,
          idempotencyKey,
          undefined,
          { templateId, parameters }
        );
        templateIdempotencyKeyRef.current = null;
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
    [
      message.id,
      onRefresh,
      onReplied,
      templateIdempotencyKeyRef,
      setSubmitting,
      setTemplateError,
      setTemplatesOpen,
      setThreadRefreshKey,
    ]
  );
  return {
    performSend,
    collision,
    sendAnyway,
    cancelCollision,
    handleSend,
    sendActions,
    handleSendWith,
    rememberSendAction,
    handleSendPick,
    handleOpenTemplates,
    handleSendTemplate,
  };
}
