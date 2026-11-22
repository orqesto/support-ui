import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { messageService, type ReplyAssignIntent } from '@/services/message.service';
import type { organizationService } from '@/services/organization.service';
import { forgetOwnSend, rememberOwnSend } from '@/lib/ownSends';
import { logger } from '@/lib/logger';
import { noteFromEditor } from '@/lib/noteText';
import { toast } from '@/lib/toast';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { isBlankRichText, stripHtml } from '@/lib/stripHtml';
import type { Message } from '@/types';
import { draftToRecipients, emptyRecipientDraft, type RecipientDraft } from '../RecipientFields';
import {
  decideAssignOnReplyPrompt,
  readAssignOnReplySetting,
  type AssignOnReplyPrompt,
} from '../assignOnReplyPrompt';
import {
  isRetryableSendFailure,
  replyNotDelivered,
  resolveSendFailureMessage,
} from '@/features/messages/components/sendErrorMessage';
import {
  ALREADY_DELIVERED,
  FILES_NOT_KEPT,
  NOT_RETRYABLE,
  sameReplySendingId,
  stillSendingShown,
  mergeFailedSend,
  sameReplyText,
  sendAgainTarget,
  notDeliveredText,
  uncertainFailureText,
} from '../deliveryState';
import { replyCollisionQuestion } from '@/lib/apiError';
import {
  isResendDelivered,
  isSendInFlight,
  isSendKeyReused,
  isStoredFilesUnreadable,
} from '../sendRefusals';
import { afterSendNotes } from '../afterSendNotes';
import { useTemplateSend } from './useTemplateSend';
import { postReply } from './postReply';
import type { SendAction } from '../ComposerSendButton';
import { useSendActions, type AfterSend } from './useSendActions';
import type { ResolveMode } from '../resolveMode';
import { fileIdentity, keyForPayload } from './sendKey';
import type { UnsentDraftSend } from '@/hooks/useUnsentDraft';
import type { MessageDetailProps, Setter } from './types';
import type { useComposerText } from './useComposerText';
import type { useDetailDialogs } from './useDetailDialogs';
import type { useReplyComposerState } from './useReplyComposerState';
import type { useThreadEvents } from './useThreadEvents';

/** The reply as it was when Send was pressed: what a send that waits for the thread sends. */
type HeldReply = {
  composer: string;
  composerMode: 'reply' | 'note';
  selectedFiles: File[];
  recipientDraft: RecipientDraft;
  aiSource: ReturnType<typeof useComposerText>['aiSource'];
  aiDraft: ReturnType<typeof useComposerText>['aiDraft'];
  /** What happens after it is out (resolve, save to KB, hold, nothing) — as pressed, too. */
  after: AfterSend;
};
/** How long a reply waits for its thread's events before it gives up (nothing is sent). */
export const WAIT_FOR_THREAD_MS = 10_000;
export const THREAD_NOT_LOADED =
  'Could not load the conversation. Check your connection and send again.';

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
  afterSendRef: MutableRefObject<AfterSend>;
  setSendHoldOpen: Setter<boolean>;
  setSendAction: Setter<SendAction>;
  setAssignPrompt: Setter<AssignOnReplyPrompt | null>;
  currentUserId: number | null;
  currentOrganization: Awaited<ReturnType<typeof organizationService.getCurrent>> | undefined;
  resolveMode: ResolveMode;
} & Pick<MessageDetailProps, 'onReplied' | 'onResolve' | 'onOptimisticMove' | 'onRefresh'>) {
  const { composer, composerMode, aiSource, setAiSource, aiDraft, setAiDraft, writeComposer } =
    composerText;
  const { latestComposer } = composerText;
  const { setSubmitting } = dialogs;
  const {
    selectedFiles,
    setSelectedFiles,
    setSendFailedError,
    setSendFailedReason,
    setSendFailedEventId,
    failedSendRef,
    requestOutRef,
    sendBusyRef,
    stillSending,
    setStillSending,
    setSendFailureRetryable,
    sendFailureRetryable,
    setSendFailedAfter,
    resendOf,
    setResendOf,
    declinedResendRef,
    lastAssignRef,
    lastSendModeRef,
    sendIdempotencyKeyRef,
  } = replyState;
  const { setNotesBump, setThreadRefreshKey, pullNewEvents, threadMessages, threadEventsFor } =
    thread;
  // The thread's events for THIS message are still being read (not: failed to load).
  const threadPending = threadEventsFor !== message.id && thread.threadError === null;
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
  // Replies whose 502 said `retryable: false`: no Resend on their bubbles (in this tab only).
  const [notResendable, setNotResendable] = useState<ReadonlySet<number>>(() => new Set());
  const collisionRef = useRef<string | null>(null);
  const showCollision = useCallback((question: string | null) => {
    collisionRef.current = question;
    setCollision(question);
  }, []);
  // The saved, undelivered reply the last failed send named (`failedSendRef`, per thread): the
  // bar's Retry replaces THAT reply (`resendOfEventId`), as the bubble's Resend does.
  const lastWasRetryRef = useRef(false);
  const lastConfirmedRef = useRef(false);
  /*
    A reply that MAY have reached the customer is about to go out again — by Send or by the bar's
    Retry. What tells a repeat from a new reply is in deliveryState.ts (sendAgainTarget): the same
    text as this agent's own latest undelivered, uncertain reply. Then the agent is asked first
    (`confirmed`: the bar asked already), and it goes as a resend of that reply. Any other text is
    a new reply: sent as one, unasked, and never as a resend of the failed one.
  */
  const [sendAgain, setSendAgain] = useState<{
    assign?: ReplyAssignIntent;
    retry: boolean;
    /** The reply it would replace: its stored files go again when the composer has none. */
    eventId: number;
    /** That reply WAS delivered: the confirmed send is a new reply, and says so. */
    delivered?: boolean;
  } | null>(null);
  /*
    A resend the server refused because the reply had been delivered after all
    (REPLY_RESEND_NOT_UNDELIVERED): nothing was sent again. While the composer still holds that
    text, a notice says so (not a "Send failed" bar), and Send asks before posting it as a new
    reply — the customer would get it twice. Another text is another reply: no question.
  */
  const [delivered, setDelivered] = useState<{
    threadId: number;
    text: string;
    eventId: number;
  } | null>(null);
  const deliveredUp = delivered?.threadId === message.id && sameReplyText(composer, delivered.text);
  /*
    A reply sent while the thread's events are still being read waits for them: what it may
    repeat, and what it has seen, is only known from the thread. Never sent blind.
     - What waits is the reply AS PRESSED (`held`: text, files, recipients, mode, the AI marks) for
       the thread it was pressed in, with its after-send choice; the composer is read-only
       meanwhile (`submitting` — MessageComposer locks the editor, files and recipients).
     - A ref, cleared before the send goes on: the waiting reply goes out once, never again.
     - The read fails, or takes longer than WAIT_FOR_THREAD_MS: nothing is sent, the text stays,
       and the bar says so.
  */
  const waitingRef = useRef<{
    readUnderWay: boolean;
    messageId: number;
    args: [ReplyAssignIntent | undefined, boolean, boolean, boolean];
    held: HeldReply;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const liveComposer = composer;
  const liveMode = composerMode;
  const liveFiles = selectedFiles;
  const liveRecipients = recipientDraft;
  const liveAiSource = aiSource;
  const liveAiDraft = aiDraft;
  const notLoaded = useCallback(() => {
    sendBusyRef.current = false;
    setAssignPrompt(null);
    setSubmitting(false);
    setSendFailedError(null);
    setSendFailedReason(THREAD_NOT_LOADED);
  }, [sendBusyRef, setAssignPrompt, setSendFailedError, setSendFailedReason, setSubmitting]);
  const performSend = useCallback(
    async (
      assign?: ReplyAssignIntent,
      confirmOverride = false,
      retry = false,
      confirmed = false,
      held?: HeldReply
    ) => {
      // One send at a time, whoever asks (button, Send ▾, shortcut, the bar, a dialog): while one
      // waits for its thread or is out, another press does nothing.
      if (sendBusyRef.current) return;
      // (Shadows the hook's own values on purpose: everything below sends what was pressed.)
      const { composer, composerMode, selectedFiles, recipientDraft, aiSource, aiDraft } = held ?? {
        composer: liveComposer,
        composerMode: liveMode,
        selectedFiles: liveFiles,
        recipientDraft: liveRecipients,
        aiSource: liveAiSource,
        aiDraft: liveAiDraft,
      };
      const isReply = composerMode !== 'note';
      // A website visitor who left no email: no way of sending (button, Send ▾, shortcut, Retry,
      // Resend) goes out — the composer says why. A note is not delivered, so it posts.
      // Whatever the caller: a reply with no text and no file is never sent.
      const empty = isBlankRichText(composer) && selectedFiles.length === 0;
      if (isReply && (replyState.noVisitorEmail || empty)) return;
      if (isReply && threadEventsFor !== message.id) {
        if (waitingRef.current !== null) return;
        // The read failed. A reply that waited for it is over (nothing sent, said so). A new
        // press of Send reads the thread AGAIN and waits for that read, under the same bound —
        // so "send again" works as soon as the connection is back.
        if (!threadPending && held) {
          notLoaded();
          return;
        }
        if (!threadPending) setThreadRefreshKey((key) => key + 1);
        setAssignPrompt(null);
        setSendFailedError(null);
        setStillSending(null);
        setSubmitting(true);
        sendBusyRef.current = true;
        waitingRef.current = {
          // (False after a restart, until the new read is seen under way.)
          readUnderWay: threadPending,
          messageId: message.id,
          args: [assign, confirmOverride, retry, confirmed],
          held: {
            composer,
            composerMode,
            selectedFiles,
            recipientDraft,
            aiSource,
            aiDraft,
            // Read now: nothing pressed during the wait can change what this reply does next.
            after: afterSendRef.current,
          },
          timer: setTimeout(() => {
            if (waitingRef.current === null) return;
            waitingRef.current = null;
            notLoaded();
          }, WAIT_FOR_THREAD_MS),
        };
        return;
      }
      const loaded = threadMessages;
      // The same text is on its way already (an earlier send of it has not finished): sending
      // now would make a second reply. Said, re-read, and nothing sent.
      const sendingId = isReply ? sameReplySendingId(composer, loaded, currentUserId) : null;
      if (sendingId !== null) {
        setAssignPrompt(null);
        setSendFailedError(null);
        // A notice, not a failure: it goes when that reply is sent (or not delivered) or the
        // text changes (stillSendingShown).
        setStillSending({
          threadId: message.id,
          text: composer,
          eventId: sendingId,
          afterId: null,
        });
        setThreadRefreshKey((key) => key + 1);
        return;
      }
      let failed = failedSendRef.current?.threadId === message.id ? failedSendRef.current : null;
      // Another text is another reply: what the failed send reported no longer steers this one
      // (its Retry must not replace a reply the customer may have with a different one).
      if (isReply && failed && !sameReplyText(composer, failed.text)) {
        failedSendRef.current = null;
        failed = null;
      }
      if (
        isReply &&
        !confirmed &&
        delivered?.threadId === message.id &&
        sameReplyText(composer, delivered.text)
      ) {
        setAssignPrompt(null);
        setSendAgain({ assign, retry, eventId: delivered.eventId, delivered: true });
        return;
      }
      const repeated =
        isReply && !resendOf ? sendAgainTarget(composer, loaded, failed, currentUserId) : null;
      // "Not a resend" for that very reply: a new reply, as the agent said.
      const again = repeated === declinedResendRef.current ? null : repeated;
      if (again !== null && !confirmed) {
        setAssignPrompt(null);
        setSendAgain({ assign, retry, eventId: again });
        return;
      }
      lastWasRetryRef.current = retry;
      lastConfirmedRef.current = confirmed;
      sendBusyRef.current = true;
      setSubmitting(true);
      setSendFailedError(null);
      setStillSending(null);
      setDelivered(null);
      setSendFailureRetryable(false);
      lastAssignRef.current = assign;
      lastSendModeRef.current = composerMode;
      // Undefined unless the agent actually addressed this reply somewhere, which
      // the BE reads as "the requester and nobody else".
      const recipients = supportsRecipients ? draftToRecipients(recipientDraft) : undefined;
      // Send ▾: "Send, resolve & save to KB" rides on the reply itself — the server resolves in the
      // reply's own transaction (reverted if delivery fails) and, told by `saveToKb`, captures the
      // thread for the knowledge base in the background once the reply is out.
      // The other choices run after the reply is out.
      const after = held?.after ?? afterSendRef.current;
      afterSendRef.current = { action: 'send' };
      const resolveInSend = composerMode !== 'note' && after.action === 'resolve_kb';
      // A Resend: this reply replaces the undelivered one (never on a note).
      const composerResendOf = composerMode === 'note' ? undefined : resendOf?.eventId;
      // The reply this one replaces: the one the agent just agreed to send again, or — Retry of
      // the same text — the one the failed send named.
      const retryOf = again ?? (retry && isReply && failed ? failed.eventId : undefined);
      const resendOfEventId = composerResendOf ?? retryOf;
      // The stored-files choice of a resend from the composer (ResendNotice); absent = default.
      const keepStoredFiles =
        composerResendOf === undefined ? undefined : resendOf?.keepStoredFiles;
      // Notes aren't emails — no idempotency needed, and a note must not read, register or clear
      // the reply's token: one kept from a failed reply has to survive the note so that reply's
      // retry still dedups. A reply reuses a failed attempt's token only when it delivers the SAME
      // email — body, files, recipients (a retry, so the BE dedups); any other reply mints its own:
      // with the old token the BE would answer with the earlier send and this one would never go
      // out. The assign / resolve flags stay out: a send that landed despite the error re-reads the
      // thread as assigned, so re-pressing Send carries no assign answer — and must still dedup.
      // The key a failed attempt kept: reused below only for the same payload (a true retry).
      const keptKey = sendIdempotencyKeyRef.current?.key;
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
                // Its own key per resend (the contract): never the failed send's.
                resendOfEventId ?? null,
                // Which files go is part of the email.
                keepStoredFiles ?? null,
              ])
            );
      // Not in the key's payload above: "Send anyway" is the same reply, so it keeps the key.
      const guard =
        seenLastEventId === undefined && !confirmOverride && resendOfEventId === undefined
          ? undefined
          : {
              ...(seenLastEventId !== undefined && { seenLastEventId }),
              ...(confirmOverride && { confirmOverride: true }),
              ...(resendOfEventId !== undefined && { resendOfEventId }),
              ...(keepStoredFiles !== undefined && { keepStoredFiles }),
            };
      // Before the request: the `message:replied` echo can beat the HTTP answer.
      if (idempotencyKey) rememberOwnSend(idempotencyKey);
      // After the key is minted: the kept copy rides with it while the send is out.
      const draftSend = beginDraftSend();
      // (A reply's request only: a note's success re-reads the notes alone, so a `send-failed`
      //  event arriving meanwhile must still read the thread.)
      requestOutRef.current = isReply;
      try {
        // The reply's answer (raw): what it says went wrong after the reply was out.
        let answer: unknown;
        if (composerMode === 'note') {
          // The composer is the rich-text editor; a note is plain text (noteText.ts).
          await messageService.addNote(message.id, noteFromEditor(composer));
        } else {
          answer = await postReply(message.id, {
            composer,
            selectedFiles,
            resolveInSend,
            aiSource,
            idempotencyKey,
            aiDraft,
            recipients,
            assign,
            guard,
          });
        }
        // success — the next reply is a new logical send
        if (composerMode !== 'note') {
          sendIdempotencyKeyRef.current = null;
          failedSendRef.current = null;
        }
        // Out: never "unsent" again, even when the agent already left the thread.
        draftSend.settle(true);
        // The composer is read-only while a send is out, so it still holds what was sent. Should
        // anything have written other words into it meanwhile, they are the agent's: kept.
        if (stripHtml(latestComposer.current) === stripHtml(composer)) {
          writeComposer('');
          setAiSource(null);
          setAiDraft(null);
        }
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
        else if (resendOfEventId !== undefined || idempotencyKey === keptKey) {
          // The failed bubble is gone server-side — a resend replaces it, and so does a retry with
          // the failed send's own key: only a full read drops it from the screen.
          setResendOf(null);
          setThreadRefreshKey((key) => key + 1);
        } else
          pullNewEvents({
            activity: true,
            attachments: selectedFiles.length > 0,
            // {} when nobody was addressed — "the requester and nobody else".
            participants: recipients !== undefined && Object.keys(recipients).length > 0,
          });
        // A sent reply (not an internal note) flips the conversation to Pending —
        // move the board card optimistically before the heavier onRefresh reconcile.
        if (composerMode !== 'note') onReplied?.();
        const notes = isReply ? afterSendNotes(answer) : null;
        // One plain sentence per thing that did not finish after the reply was out.
        for (const sentence of notes?.sentences ?? []) toast.warning(sentence);
        if (resolveInSend) {
          // The capture runs in the background and lands on the thread's activity; without a word
          // here the agent cannot tell this send from a plain "Send and resolve".
          if (!notes?.kbSaveFailed && !notes?.resolveFailed)
            toast.success(
              'Sent and resolved. Saving this thread to the knowledge base for review.'
            );
          if (!notes?.resolveFailed) onResolve?.();
        } else if (composerMode !== 'note' && after.action !== 'send') {
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
        // (The resend target stays through the collision confirm: "Send anyway" is the same resend
        // with the same key — review of #999, M1.)
        const question = composerMode === 'note' ? null : replyCollisionQuestion(err);
        if (question !== null) {
          showCollision(question);
          return;
        }
        // A resend the server refused (4xx: resent already, delivered after all, not found) is
        // over. One that failed in the transport (5xx, no answer) made a NEW undelivered reply
        // that replaced the old one: the target stays, and the re-read below moves it to that
        // reply (useResendReply → reconcileResendTarget), so the next Send resends it (M2).
        // A key the server says belongs to another thread: nothing was sent or stored here. The key
        // is dropped, so sending again mints a new one and the same reply (or resend) can go out.
        const keyReused = isSendKeyReused(err);
        if (keyReused) sendIdempotencyKeyRef.current = null;
        // Still being sent by an earlier request (409 REPLY_SEND_IN_FLIGHT): nothing new was
        // stored. The key and the resend target stay — dropped, the next Send would go out as a
        // NEW reply while that one is on its way — and Retry stays for when it has ended.
        const inFlight = composerMode !== 'note' && isSendInFlight(err);
        const retryable = keyReused || inFlight || isRetryableSendFailure(err);
        // The files stored with the reply being resent could not be read: nothing was sent, and
        // that reply is still undelivered. The target stays, so attaching the files and pressing
        // Send resends it; the server's sentence says what to do (no Retry: it would fail again).
        const filesUnreadable = resendOfEventId !== undefined && isStoredFilesUnreadable(err);
        // Delivered after all: no bar — the notice says so, and the re-read below shows it sent.
        const wasDelivered = resendOfEventId !== undefined && isResendDelivered(err);
        if (wasDelivered)
          setDelivered({ threadId: message.id, text: composer, eventId: resendOfEventId });
        if (resendOfEventId !== undefined && !retryable && !filesUnreadable) {
          setResendOf(null);
          if (failedSendRef.current?.eventId === resendOfEventId) failedSendRef.current = null;
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
        // Saved, not delivered (the reply's own 502 answer): said and handled exactly as the
        // `send-failed` socket event is — which may never arrive. The server's sentence is not
        // shown. The bar names the saved reply, and warns first when it may have gone out.
        const undelivered = composerMode === 'note' ? null : replyNotDelivered(err);
        if (undelivered) {
          // One report with the socket event's, whichever came first: merged by event id.
          const known = mergeFailedSend(failedSendRef.current, {
            threadId: message.id,
            text: composer,
            eventId: undelivered.eventId,
            uncertain: undelivered.uncertain,
          });
          failedSendRef.current = known;
          // The backend's own sentence when it names the cause of a reply that did not go out;
          // otherwise the sentence the socket event writes for the same reply, channel included.
          setSendFailedReason(
            `${
              known.uncertain
                ? uncertainFailureText(message.channel)
                : (undelivered.sentence ?? notDeliveredText(message.channel))
            }${undelivered.filesNotStored ? ` ${FILES_NOT_KEPT}` : ''}${
              undelivered.retryable ? '' : ` ${NOT_RETRYABLE}`
            }`
          );
          setSendFailedEventId(undelivered.eventId);
          if (!undelivered.retryable) {
            setNotResendable((ids) => new Set(ids).add(undelivered.eventId));
            // A resend refused for good is over: the next Send is a new reply, not another resend.
            if (composerResendOf !== undefined) setResendOf(null);
          }
        } else if (inFlight) {
          // On its way already: a notice, not a failure — and no bar. The text, its key and the
          // resend target stay, so Send pressed again later is that same send.
          setStillSending({
            threadId: message.id,
            text: composer,
            eventId: null,
            afterId: seenLastEventId ?? null,
          });
        } else if (!wasDelivered) {
          setSendFailedReason(resolveSendFailureMessage(err));
          // The answer named no reply (an older backend, a proxy's 502, no answer at all), and
          // the `send-failed` event may not come either: the bar then looks in the re-read thread
          // for the reply this send left — the agent's own, after the newest event on screen.
          if (retryable && seenLastEventId !== undefined && currentUserId !== null)
            setSendFailedAfter({ afterId: seenLastEventId, authorId: currentUserId });
        }
        // (A resend from the bubble has no Retry: its target stays, so Send resends it.)
        // (`retryable: false` from the backend: sending again cannot help — no Retry. The bubble
        //  keeps its Resend, for when the agent has dealt with the cause.)
        setSendFailureRetryable(
          composerResendOf === undefined &&
            retryable &&
            !inFlight &&
            undelivered?.retryable !== false
        );
      } finally {
        requestOutRef.current = false;
        sendBusyRef.current = false;
        setSubmitting(false);
        setAssignPrompt(null);
      }
    },
    [
      latestComposer,
      sendBusyRef,
      setStillSending,
      liveAiDraft,
      liveAiSource,
      liveComposer,
      liveMode,
      liveFiles,
      liveRecipients,
      notLoaded,
      replyState.noVisitorEmail,
      message.id,
      message.channel,
      onOptimisticMove,
      onRefresh,
      onReplied,
      onResolve,
      pullNewEvents,
      resendOf,
      setResendOf,
      declinedResendRef,
      delivered,
      seenLastEventId,
      threadMessages,
      threadEventsFor,
      threadPending,
      failedSendRef,
      currentUserId,
      setSendFailedAfter,
      showCollision,
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
      setSendFailedEventId,
      requestOutRef,
      setSendFailedReason,
      setSendFailureRetryable,
      setSubmitting,
      setThreadRefreshKey,
    ]
  );
  // The thread's events have landed (or failed to load): the waiting send goes on from here,
  // with the thread as it is now.
  useEffect(() => {
    const waiting = waitingRef.current;
    if (waiting === null) return;
    if (threadPending) waiting.readUnderWay = true;
    if (threadPending || !waiting.readUnderWay) return;
    waitingRef.current = null;
    clearTimeout(waiting.timer);
    // Cleared here, synchronously, before the send goes on (which sets it again while it is out).
    sendBusyRef.current = false;
    setSubmitting(false);
    // (Pressed for another thread — a switch without a remount: not this thread's reply.)
    if (waiting.messageId !== message.id) return;
    void performSend(...waiting.args, waiting.held);
  }, [threadPending, performSend, setSubmitting, message.id, sendBusyRef]);
  useEffect(
    () => () => {
      if (waitingRef.current) {
        clearTimeout(waitingRef.current.timer);
        sendBusyRef.current = false;
      }
      waitingRef.current = null;
    },
    [sendBusyRef]
  );
  // The "still being sent" notice is true only while that reply is on its way and the composer
  // holds its text; once it is not, it is forgotten (never back when the text is typed again).
  const stillSendingUp = stillSendingShown(
    stillSending,
    message.id,
    composer,
    threadMessages,
    currentUserId
  );
  useEffect(() => {
    if (stillSending !== null && !stillSendingUp) setStillSending(null);
  }, [stillSending, stillSendingUp, setStillSending]);
  /** "Send again" in the confirm above: the same reply, as a resend of the one that failed. */
  const confirmSendAgain = useCallback(() => {
    const pending = sendAgain;
    setSendAgain(null);
    if (pending) void performSend(pending.assign, false, pending.retry, true);
  }, [performSend, sendAgain]);
  const cancelSendAgain = useCallback(() => setSendAgain(null), []);
  /** The bar's Retry: the same draft; it replaces the saved reply the failure named, if any. */
  const retrySend = useCallback(
    () => void performSend(lastAssignRef.current, false, true),
    [lastAssignRef, performSend]
  );

  /** The confirm's "Send anyway": the same reply, its kept key, the override flag. */
  const sendAnyway = useCallback(() => {
    if (collisionRef.current === null) return;
    showCollision(null);
    void performSend(
      lastAssignRef.current,
      true,
      lastWasRetryRef.current,
      lastConfirmedRef.current
    );
  }, [lastAssignRef, performSend, showCollision]);
  /** Cancel (or the dialog closed): the draft stays as it was; the thread is read again. */
  const cancelCollision = useCallback(() => {
    if (collisionRef.current === null) return;
    showCollision(null);
    setThreadRefreshKey((key) => key + 1);
    onRefresh?.();
  }, [onRefresh, setThreadRefreshKey, showCollision]);

  const handleSend = useCallback(async () => {
    if (sendBusyRef.current) return;
    // Require real text — blocks Ctrl+Shift+Enter attachment-only sends the disabled
    // button can't (empty, whitespace, or markup-only like `<p><br></p>`).
    // No reply can go out either (a website visitor with no email): nothing is asked — the
    // ownership prompt's answers would send nothing and leave it open.
    if (isBlankRichText(composer) || (composerMode !== 'note' && replyState.noVisitorEmail)) return;
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
    sendBusyRef,
    setAssignPrompt,
    replyState.noVisitorEmail,
  ]);

  // Resolving rides on any thread the Resolve row could resolve — an UNREVIEWED one too: its
  // "dismiss without a reply" meaning is the row's, and a send IS the reply, so there is an answer
  // to resolve on (and to save to the KB). The row hides while a reply is typed, so leaving these
  // out left a new thread with a draft no way to resolve at all (owner, 2026-11-03). Hold always.
  const sendActions: SendAction[] =
    resolveMode !== null ? ['send', 'resolve', 'resolve_kb', 'hold'] : ['send', 'hold'];
  const { handleSendWith, rememberSendAction, handleSendPick, sendWithHold } = useSendActions({
    composer,
    blocked: replyState.noVisitorEmail,
    handleSend,
    afterSendRef,
    sendBusyRef,
    setSendHoldOpen,
    setSendAction,
    currentUserId,
  });

  const { handleOpenTemplates, handleSendTemplate } = useTemplateSend({
    messageId: message.id,
    replyState,
    setSubmitting,
    setThreadRefreshKey,
    onReplied,
    onRefresh,
  });
  return {
    performSend,
    retrySend,
    /** The props of the "Send this reply again?" confirm. */
    sendAgainConfirm: {
      open: sendAgain !== null,
      // Delivered: the confirmed send is a NEW reply — the old one's stored files do not go.
      eventId: sendAgain?.delivered ? null : (sendAgain?.eventId ?? null),
      delivered: sendAgain?.delivered === true,
      // Files in the composer go instead of the reply's stored ones.
      attachedHere: selectedFiles.length,
      onOpenChange: (open: boolean) => {
        if (!open) cancelSendAgain();
      },
      onConfirm: confirmSendAgain,
    },
    /** Replies the backend said cannot be sent again: their bubbles offer no Resend. */
    notResendable,
    /**
     * The plain notice where the failure bar would be (null: none), and its dismiss: "already
     * delivered — nothing was sent again" while the composer holds that text, or "still being sent".
     */
    notice: deliveredUp
      ? { text: ALREADY_DELIVERED, onDismiss: () => setDelivered(null) }
      : stillSendingUp
        ? { onDismiss: () => setStillSending(null) }
        : null,
    /**
     * The failure bar's Retry: only while the failed draft is still there to resend (a blank
     * composer means the agent cleared it, or the async failure came after the send cleared it).
     */
    barRetry:
      sendFailureRetryable && !isBlankRichText(composer) && composerMode === lastSendModeRef.current
        ? retrySend
        : undefined,
    collision,
    sendAnyway,
    cancelCollision,
    handleSend,
    sendActions,
    handleSendWith,
    rememberSendAction,
    handleSendPick,
    sendWithHold,
    handleOpenTemplates,
    handleSendTemplate,
  };
}
