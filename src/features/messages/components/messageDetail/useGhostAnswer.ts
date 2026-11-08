import { useState, useCallback, type MutableRefObject, type RefObject } from 'react';
import type { AiDraft } from '@/services/message.service';
import { isBlankRichText } from '@/lib/stripHtml';
import { toast } from '@/lib/toast';
import type { RichTextEditorHandle } from '@/components/shared/RichTextEditor';
import type { KBAttachment } from '../AiTabPanel';
import { answerToEditorHtml } from '../messageDetailConstants';
import { holdsUnsentNote, NOTE_IN_PROGRESS } from './detailConstants';
import type { Setter } from './types';

/** A suggested answer going into the composer — never silently over the agent's own text. */

export function useGhostAnswer({
  writeComposer,
  setComposerMode,
  showComposerForShortcut,
  richEditorRef,
  handleAiSourceChange,
  latestComposer,
  lastEditMode,
}: {
  writeComposer: (next: React.SetStateAction<string>, landsIn?: 'reply' | 'note') => void;
  setComposerMode: Setter<'reply' | 'note'>;
  showComposerForShortcut: () => void;
  richEditorRef: RefObject<RichTextEditorHandle>;
  handleAiSourceChange: (source: string | null, draft?: AiDraft) => void;
  latestComposer: MutableRefObject<string>;
  lastEditMode: MutableRefObject<'reply' | 'note' | null>;
}) {
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
    [handleAiSourceChange, showComposerForShortcut, writeComposer, richEditorRef, setComposerMode]
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
    [applyGhostAnswer, lastEditMode, latestComposer]
  );
  return {
    applyGhostAnswer,
    pendingGhost,
    setPendingGhost,
    handleGhostClick,
  };
}
