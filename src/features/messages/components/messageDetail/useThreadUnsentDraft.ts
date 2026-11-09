import { useCallback, useMemo } from 'react';
import type { AiDraft } from '@/services/message.service';
import { useUnsentDraft } from '@/hooks/useUnsentDraft';
import { isBlankRichText } from '@/lib/stripHtml';
import type { useComposerText } from './useComposerText';

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
};

/** The thread composer's unsent text, kept in this browser per thread (useUnsentDraft). */
export function useThreadUnsentDraft(
  threadId: number,
  composerText: ReturnType<typeof useComposerText>
) {
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
  const blank = isBlankRichText(composer);
  const value = useMemo<ThreadDraft>(
    () => ({
      html: composer,
      mode: lastEditMode.current ?? composerMode,
      aiSource,
      aiDraft,
    }),
    // lastEditMode is a ref that changes together with `composer`.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
    [composer, composerMode, aiSource, aiDraft]
  );
  const restore = useCallback(
    (data: ThreadDraft) => {
      if (typeof data?.html !== 'string' || isBlankRichText(data.html)) return;
      const mode = data.mode === 'note' ? 'note' : 'reply';
      writeComposer(data.html, mode);
      setComposerMode(mode);
      if (data.aiSource) handleAiSourceChange(data.aiSource, data.aiDraft ?? undefined);
    },
    [writeComposer, setComposerMode, handleAiSourceChange]
  );
  const { restored, dismissRestored } = useUnsentDraft({
    scope: `thread:${threadId}`,
    value,
    isBlank: blank,
    restore,
  });
  const discardRestored = useCallback(() => {
    writeComposer('');
    handleAiSourceChange(null);
    dismissRestored();
  }, [writeComposer, handleAiSourceChange, dismissRestored]);
  return { restoredDraft: restored, discardRestoredDraft: discardRestored };
}
