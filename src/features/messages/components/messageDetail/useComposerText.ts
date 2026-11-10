import { useState, useEffect, useRef, useCallback } from 'react';
import type { AiDraft } from '@/services/message.service';
import { isBlankRichText, stripHtml } from '@/lib/stripHtml';

/** The composer's ONE text (reply or note), its AI provenance and the mode it was last edited in. */

export function useComposerText() {
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
  // Refs, not state: two writes inside one render batch must both see the first one's text.
  const latestComposer = useRef(composer);
  latestComposer.current = composer;
  const composerModeRef = useRef(composerMode);
  composerModeRef.current = composerMode;
  // The mode the composer's words were last written in (holdsUnsentNote) — null while blank.
  const lastEditMode = useRef<'reply' | 'note' | null>(null);
  /*
    When the agent last changed the composer's words (thread presence: "writing" vs a draft left
    in the box, spec §5.1) — null while blank, so a cleared composer never counts as writing.
    Every write through writeComposer is the agent's own (typing, a template, the ghost answer,
    the AI action buttons, add-record); the clear after a send is blank, so it resets this.
  */
  const lastAgentEditAt = useRef<number | null>(null);
  /*
    EVERY composer text write goes through here. Typing counts in the mode on screen; a
    programmatic insert passes the mode it lands in. A write that leaves the visible text as it
    was (TipTap re-normalising the HTML when the other mode's editor mounts) is not an edit, so
    N alone never turns a reply into a note. `{ restore: true }` (a kept draft coming back) is not
    the agent acting, so it does not stamp lastAgentEditAt: a restored draft counts as viewing.
  */
  const writeComposer = useCallback(
    (
      next: React.SetStateAction<string>,
      landsIn?: 'reply' | 'note',
      opts?: { restore?: boolean }
    ) => {
      const prev = latestComposer.current;
      const value = typeof next === 'function' ? next(prev) : next;
      latestComposer.current = value;
      const blank = isBlankRichText(value);
      const edited = !blank && (landsIn !== undefined || stripHtml(value) !== stripHtml(prev));
      if (blank) lastEditMode.current = null;
      else if (edited || lastEditMode.current === null)
        lastEditMode.current = landsIn ?? composerModeRef.current;
      if (blank) lastAgentEditAt.current = null;
      else if (edited && !opts?.restore) lastAgentEditAt.current = Date.now();
      setComposer(value);
    },
    []
  );
  return {
    composer,
    aiSource,
    setAiSource,
    aiDraft,
    setAiDraft,
    handleAiSourceChange,
    composerMode,
    setComposerMode,
    latestComposer,
    lastEditMode,
    lastAgentEditAt,
    writeComposer,
  };
}
