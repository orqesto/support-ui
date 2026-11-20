import { useCallback, useEffect } from 'react';
import { toast } from '@/lib/toast';
import { translatedTextToHtml } from '@/lib/editorText';
import { isBlankRichText } from '@/lib/stripHtml';
import type { MessageEvent } from '@/types';
import { deliveryStateOf, isUndelivered } from '../deliveryState';
import type { useComposerText } from './useComposerText';
import type { useReplyComposerState } from './useReplyComposerState';

/**
 * "Resend" on an undelivered reply (owner 2026-11-20): its text goes back into the composer, where
 * the agent may edit it, and the next send names it (`resendOfEventId`) — the backend then stores
 * the new attempt and hides the failed bubble, so the thread never shows the reply twice.
 *
 * ⛔ Never over the agent's own words: a composer that already holds text is left alone.
 * Attachments are not carried over (a failed send never stored its files): the notice says so.
 */
export function useResendReply(
  { writeComposer, setComposerMode, latestComposer, composer }: ReturnType<typeof useComposerText>,
  { richEditorRef, resendOf, setResendOf }: ReturnType<typeof useReplyComposerState>,
  showComposerForShortcut: () => void
) {
  // The agent cleared the composer: what they write next is a new reply, not the resend.
  const cleared = resendOf !== null && isBlankRichText(composer);
  useEffect(() => {
    if (cleared) setResendOf(null);
  }, [cleared, setResendOf]);
  return useCallback(
    (msg: MessageEvent) => {
      const state = deliveryStateOf(msg);
      if (msg.type !== 'agent_reply' || !isUndelivered(state)) return;
      if (!isBlankRichText(latestComposer.current)) {
        toast.error('Send or clear the reply you are writing first, then resend.');
        return;
      }
      writeComposer(translatedTextToHtml(msg.content), 'reply');
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
