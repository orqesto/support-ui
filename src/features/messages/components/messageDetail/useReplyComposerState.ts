import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { ReplyAssignIntent } from '@/services/message.service';
import type { Message } from '@/types';
import type { RichTextEditorHandle } from '@/components/shared/RichTextEditor';
import { resolveComposerWindow } from '../whatsappWindowState';
import { resolveReplyBlock } from '../replyBlockState';
import type { WhatsAppTemplate } from '../whatsappTemplates';
import type { KeptSendKey } from './sendKey';
import type { Setter } from './types';
import type { FailedSend, ResendTarget } from '../deliveryState';

/** Files, send failures, the channel window, WhatsApp templates and the editor refs. */

export function useReplyComposerState(message: Message, composerMode: 'reply' | 'note') {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [sendFailedError, setFailedReason] = useState<string | null>(null);
  // The reply event an ASYNC failure (`send-failed`) named: once the thread shows that reply as
  // delivered (a late answer from the channel), the bar would contradict the bubble, so it hides.
  // Any other change of the bar forgets it.
  const [sendFailedEventId, setSendFailedEventId] = useState<number | null>(null);
  // What is known about that reply from the send's 502 answer and the socket event together
  // (deliveryState.ts FailedSend): Retry, and the same text sent again, replace THAT reply.
  const failedSendRef = useRef<FailedSend | null>(null);
  // An undelivered reply put back in the composer by its Resend: the next reply replaces it.
  const [resendOf, setResendOf] = useState<ResendTarget | null>(null);
  const setSendFailedError = useCallback<Setter<string | null>>((value) => {
    setSendFailedEventId(null);
    setFailedReason(value);
  }, []);
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
  // retry after failure (so the BE dedups a duplicate), cleared on success. Kept WITH the payload
  // it was minted for: only a resend of that same payload may reuse it — any other reply would get
  // the first one's accepted send back from the BE and never go out.
  const sendIdempotencyKeyRef = useRef<KeptSendKey | null>(null);
  // The same contract for a WhatsApp template send, kept apart: a template is a different send, so
  // it must neither carry a failed reply's token (the BE would answer with that reply and never send
  // the template) nor leave its own for the next reply.
  const templateIdempotencyKeyRef = useRef<KeptSendKey | null>(null);

  useEffect(() => {
    if (!message.whatsappWindow) return;
    const timer = setInterval(() => setWindowTick((tick) => tick + 1), 60_000);
    return () => clearInterval(timer);
  }, [message.whatsappWindow]);

  const composerWindow = useMemo(
    () => {
      // A replyBlock (e.g. a Zendesk-imported Telegram thread) outranks the WhatsApp
      // window: channels never overlap, and the block is unconditional, not a countdown.
      const block = resolveReplyBlock(message.replyBlock, composerMode);
      return block.blocked ? block : resolveComposerWindow(message.whatsappWindow, composerMode);
    },
    // windowTick is a deliberate dependency: it is what makes the countdown advance and
    // the block engage when the window lapses with the view already open. ESLint calls it
    // "unnecessary" precisely BECAUSE the body does not reference it — the 60s tick is the
    // whole point, and removing it freezes the countdown on an open thread. Suppressed
    // rather than left as prose, so the next lint sweep cannot quietly "clean it up".
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
    [message.whatsappWindow, message.replyBlock, composerMode, windowTick]
  );
  return {
    selectedFiles,
    setSelectedFiles,
    sendFailedError,
    setSendFailedError,
    sendFailedEventId,
    setSendFailedEventId,
    failedSendRef,
    // The failed send's own reason, keeping the reply the `send-failed` event named (it may come
    // before the HTTP answer — review of #999, M4).
    setSendFailedReason: setFailedReason,
    resendOf,
    setResendOf,
    sendFailureRetryable,
    setSendFailureRetryable,
    lastAssignRef,
    lastSendModeRef,
    templatesOpen,
    setTemplatesOpen,
    templates,
    setTemplates,
    templatesLoading,
    setTemplatesLoading,
    templateError,
    setTemplateError,
    richEditorRef,
    noteEditorRef,
    sendIdempotencyKeyRef,
    templateIdempotencyKeyRef,
    composerWindow,
  };
}
