import { useCallback, useEffect, useRef } from 'react';
import { toast } from '@/lib/toast';
import { translatedTextToHtml } from '@/lib/editorText';
import { isWholeEditorHtml } from '@/lib/noteText';
import { isBlankRichText } from '@/lib/stripHtml';
import type { MessageEvent } from '@/types';
import {
  deliveryStateOf,
  isUndelivered,
  reconcileResendTarget,
  sameReplyText,
} from '../deliveryState';
import type { useComposerText } from './useComposerText';
import type { useReplyComposerState } from './useReplyComposerState';
import type { useThreadEvents } from './useThreadEvents';

/**
 * A stored reply as the composer takes it (review of #999, H1): a reply sent from the app is the
 * editor's own HTML (it sends `getHTML()`, the backend stores it as is) and goes back as it was —
 * as an unsent draft is restored; plain text (a bot's or a chat channel's reply) becomes
 * paragraphs, as does plain text that merely opens with a tag. Escaping the HTML would mail the customer literal tags.
 */
export const replyToComposerHtml = (content: string): string =>
  isWholeEditorHtml(content) ? content : translatedTextToHtml(content);

/**
 * "Resend" on an undelivered reply (owner 2026-11-20): its text goes back into the composer, where
 * the agent may edit it, and the next send names it (`resendOfEventId`) — the backend then stores
 * the new attempt and hides the failed bubble, so the thread never shows the reply twice.
 *
 * ⛔ Never over the agent's own words: a composer that already holds text is left alone.
 * Attachments are not carried over (a failed send never stored its files): the notice says so.
 *
 * The target follows the thread as read (reconcileResendTarget): a resend that failed in the
 * transport made a new undelivered reply, which the target then names; a reply delivered after
 * all, or gone, ends it. Another thread never inherits it.
 */
export function useResendReply(
  { writeComposer, setComposerMode, latestComposer, composer }: ReturnType<typeof useComposerText>,
  { richEditorRef, resendOf, setResendOf }: ReturnType<typeof useReplyComposerState>,
  showComposerForShortcut: () => void,
  { threadMessages, threadEventsFor, threadId }: ReturnType<typeof useThreadEvents>
) {
  // The agent cleared the composer: what they write next is a new reply, not the resend.
  const cleared = resendOf !== null && isBlankRichText(composer);
  useEffect(() => {
    if (cleared) setResendOf(null);
  }, [cleared, setResendOf]);
  // Checked against the thread once its events are read (also a target restored with a draft).
  useEffect(() => {
    if (resendOf === null || threadEventsFor !== threadId) return;
    const next = reconcileResendTarget(resendOf, threadMessages);
    if (next !== resendOf) setResendOf(next);
  }, [resendOf, threadMessages, threadEventsFor, threadId, setResendOf]);
  // A thread switch without a remount never carries the target into the next thread.
  const shownThread = useRef(threadId);
  useEffect(() => {
    if (shownThread.current === threadId) return;
    shownThread.current = threadId;
    setResendOf(null);
  }, [threadId, setResendOf]);
  return useCallback(
    (msg: MessageEvent) => {
      const state = deliveryStateOf(msg);
      if (msg.type !== 'agent_reply' || !isUndelivered(state)) return;
      // The composer may still hold this very reply (the failed send left its text there): Resend
      // takes it over. Any other text is the agent's own and is never written over.
      if (
        !isBlankRichText(latestComposer.current) &&
        !sameReplyText(latestComposer.current, msg.content)
      ) {
        toast.error('Send or clear the reply you are writing first, then resend.');
        return;
      }
      writeComposer(replyToComposerHtml(msg.content), 'reply');
      setComposerMode('reply');
      setResendOf({ eventId: msg.id, uncertain: state === 'uncertain' });
      showComposerForShortcut();
      // Deferred: from note mode the reply editor mounts with this render.
      setTimeout(() => richEditorRef.current?.focus('end'), 0);
    },
    [
      latestComposer,
      richEditorRef,
      setComposerMode,
      setResendOf,
      showComposerForShortcut,
      writeComposer,
    ]
  );
}
