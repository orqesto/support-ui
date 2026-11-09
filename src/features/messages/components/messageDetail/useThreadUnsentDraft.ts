import { useCallback, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { toast } from '@/lib/toast';
import type { AiDraft } from '@/services/message.service';
import { useUnsentDraft } from '@/hooks/useUnsentDraft';
import { isBlankRichText } from '@/lib/stripHtml';
import { emptyRecipientDraft, type RecipientDraft } from '../RecipientFields';
import type { useComposerText } from './useComposerText';
import type { KeptSendKey } from './sendKey';

type ThreadDraft = {
  html: string;
  /*
    ⛔ The composer holds ONE text for both modes: a note restored as a reply would put words for
    the team into a message to the customer. The mode it was written in comes back with it.
  */
  mode: 'reply' | 'note';
  // Provenance comes back too, so a restored AI draft is still sent as AI-drafted (and reply_style
  // still sees what the agent changed) instead of being reported as the agent's own text.
  aiSource: string | null;
  aiDraft: AiDraft | null;
  recipients?: RecipientDraft;
  /*
    ⛔ The idempotency key a FAILED reply was sent with. A send can fail on the agent's side (a
    timeout) yet reach the customer. Before drafts were kept, a reload threw the text away; now it
    comes back, and pressing Send again must dedup on the BE — so the key comes back with it.
    keyForPayload still only reuses it for the SAME email (body, files, recipients).
  */
  sendKey?: KeptSendKey | null;
  /** Files are not kept; their count is, so the notice can ask for them again. */
  files?: number;
};

const isKeptSendKey = (value: unknown): value is KeptSendKey =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as KeptSendKey).key === 'string' &&
  typeof (value as KeptSendKey).payload === 'string';

const isRecipientDraft = (value: unknown): value is RecipientDraft =>
  typeof value === 'object' &&
  value !== null &&
  ['to', 'cc', 'bcc'].every(
    (field) => typeof (value as Record<string, unknown>)[field] === 'string'
  );

/** The thread composer's unsent text, kept in this browser per thread (useUnsentDraft). */
export function useThreadUnsentDraft({
  threadId,
  composerText,
  recipientDraft,
  setRecipientDraft,
  sendKeyRef,
  sendFailedError,
  fileCount,
}: {
  threadId: number;
  composerText: ReturnType<typeof useComposerText>;
  recipientDraft: RecipientDraft;
  setRecipientDraft: (draft: RecipientDraft) => void;
  sendKeyRef: MutableRefObject<KeptSendKey | null>;
  /** Set when a send fails — the moment the key is worth keeping (it lives in a ref). */
  sendFailedError: string | null;
  fileCount: number;
}) {
  const {
    composer,
    aiSource,
    aiDraft,
    composerMode,
    lastEditMode,
    writeComposer,
    setComposerMode,
  } = composerText;
  const { handleAiSourceChange } = composerText;
  const [restoredFiles, setRestoredFiles] = useState(0);
  const blank =
    isBlankRichText(composer) &&
    !recipientDraft.to.trim() &&
    !recipientDraft.cc.trim() &&
    !recipientDraft.bcc.trim();
  const value = useMemo<ThreadDraft>(
    () => ({
      html: composer,
      mode: lastEditMode.current ?? composerMode,
      aiSource,
      aiDraft,
      recipients: recipientDraft,
      sendKey: sendKeyRef.current,
      files: fileCount,
    }),
    // Two refs: lastEditMode changes together with `composer`; the send key is minted at send time
    // and kept on a failure, which `sendFailedError` marks.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
    [composer, composerMode, aiSource, aiDraft, recipientDraft, sendFailedError, fileCount]
  );
  const valueRef = useRef(value);
  valueRef.current = value;
  const restore = useCallback(
    (data: ThreadDraft) => {
      const hasText = typeof data?.html === 'string' && !isBlankRichText(data.html);
      const recipients = isRecipientDraft(data?.recipients) ? data.recipients : null;
      if (!hasText && !recipients) return;
      const mode = data.mode === 'note' ? 'note' : 'reply';
      if (hasText) writeComposer(data.html, mode);
      setComposerMode(mode);
      if (recipients) setRecipientDraft(recipients);
      if (data.aiSource) handleAiSourceChange(data.aiSource, data.aiDraft ?? undefined);
      if (isKeptSendKey(data.sendKey)) sendKeyRef.current = data.sendKey;
      setRestoredFiles(typeof data.files === 'number' ? data.files : 0);
    },
    [writeComposer, setComposerMode, setRecipientDraft, handleAiSourceChange, sendKeyRef]
  );
  const clearComposer = useCallback(() => {
    writeComposer('');
    setRecipientDraft(emptyRecipientDraft());
    handleAiSourceChange(null);
    sendKeyRef.current = null;
  }, [writeComposer, setRecipientDraft, handleAiSourceChange, sendKeyRef]);
  const { restored, dismissRestored, beginSend } = useUnsentDraft({
    scope: `thread:${threadId}`,
    value,
    isBlank: blank,
    restore,
    // The message itself: what another tab may have sent already.
    fingerprint: (data) => `${data.mode}\n${data.html}`,
    onSentElsewhere: () => {
      clearComposer();
      toast.info('This text was sent from another tab.');
    },
  });
  const discardRestored = useCallback(() => {
    clearComposer();
    dismissRestored();
  }, [clearComposer, dismissRestored]);
  /*
    The send's start (useReplySend, after the key was minted). The text stays kept while it is out,
    WITH the key: if the tab dies or the answer is lost, a resend of it dedups on the BE.
  */
  const beginDraftSend = useCallback(
    () =>
      beginSend({
        keep: true,
        data: { ...valueRef.current, sendKey: sendKeyRef.current },
      }),
    [beginSend, sendKeyRef]
  );
  return {
    restoredDraft: restored,
    restoredFiles,
    discardRestoredDraft: discardRestored,
    beginDraftSend,
  };
}
