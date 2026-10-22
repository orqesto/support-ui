import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useAiConfigured } from '@/hooks/useAiConfigured';
import { useAiDraftsOff, useRefreshAiDrafts } from '@/hooks/useAiDraftsOff';
import { normalizeEditorHtml } from '@/lib/editorSchema';
import { editorHtmlToText } from '@/lib/editorText';
import { logger } from '@/lib/logger';
import {
  AI_DRAFTS_OFF_MESSAGE,
  AI_NOT_CONFIGURED_MESSAGE,
  getApiErrorMessage,
  getErrorStatus,
  isAiDraftsOffError,
  isAiNotConfiguredError,
} from '@/lib/errorMessages';
import { useAiRefusalText } from '@/components/subscription/useAiRefusalText';
import { messageService } from '@/services/message.service';
import { answerToEditorHtml, COMPOSER_AI_TOOL, COMPOSER_TOOL } from './messageDetailConstants';

/** The backend's MAX_DRAFT_CHARS for polish. */
const MAX_DRAFT = 8000;

export type ComposeAiNote = { text: string; tone: 'error' | 'info' };

export const EMPTY_DRAFT_HINT = 'Type what you want to say, then press AI draft';

type Props = {
  content: string;
  setContent: (html: string) => void;
  disabled?: boolean;
  /** Reports a request in flight, so the host can lock the editor the draft is about to replace. */
  onBusyChange?: (busy: boolean) => void;
  /** What to tell the agent (an error, "not available yet"), shown on the host's note line. */
  onNoteChange?: (note: ComposeAiNote | null) => void;
  /** Where Undo renders, when not right after AI draft (the host's tool row decides). */
  undoSlot?: HTMLElement | null;
};

/**
 * AI draft in "Compose new message". A new email has no thread — no customer message to answer
 * and nothing to look up in the knowledge base — so the button only rewrites what the agent
 * typed into a sendable email (polish), and stays disabled while the editor is empty. Undo puts
 * the agent's text back.
 */
export function ComposeNewAiDraft({
  content,
  setContent,
  disabled,
  onBusyChange,
  onNoteChange,
  undoSlot,
}: Props) {
  const [busy, setBusy] = useState(false);
  // What to tell the agent. `info` (grey) for a state, not a failure: the server lacks the route.
  const [note, setNote] = useState<ComposeAiNote | null>(null);
  const setError = (text: string | null) => setNote(text ? { text, tone: 'error' } : null);
  const [previous, setPrevious] = useState<string | null>(null);
  const reportNote = useRef(onNoteChange);
  reportNote.current = onNoteChange;
  useEffect(() => {
    reportNote.current?.(note);
  }, [note]);
  useEffect(() => () => reportNote.current?.(null), []);
  const latest = useRef(content);
  latest.current = content;
  const mounted = useRef(true);
  const reportBusy = useRef(onBusyChange);
  reportBusy.current = onBusyChange;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Closing the dialog unmounts this while a request may be in flight; the modal outlives it,
      // and a busy flag never cleared kept its editor and Send locked until a page reload.
      reportBusy.current?.(false);
    };
  }, []);

  const refusalText = useAiRefusalText();
  const { aiConfigured } = useAiConfigured();
  const { off: aiDraftsOff } = useAiDraftsOff();
  const refreshAiDrafts = useRefreshAiDrafts();

  const setBusyAndReport = (value: boolean) => {
    setBusy(value);
    onBusyChange?.(value);
  };

  const text = editorHtmlToText(content);
  const empty = !text;

  const draft = async () => {
    if (empty) return;
    if (text.length > MAX_DRAFT) {
      setError(`Too long for AI draft (${MAX_DRAFT.toLocaleString()} characters) — shorten it.`);
      return;
    }
    const before = content;
    setError(null);
    setBusyAndReport(true);
    try {
      const response = await messageService.composePolish(before);
      if (!mounted.current) return;
      const drafted = response.data?.text;
      if (!drafted) {
        setError('Nothing could be drafted. Your text has not been changed.');
        return;
      }
      if (latest.current !== before) {
        setError('The message changed while drafting — press AI draft again.');
        return;
      }
      setPrevious((prev) => prev ?? before);
      setContent(normalizeEditorHtml(answerToEditorHtml(drafted)));
    } catch (err) {
      if (!mounted.current) return;
      logger.error('[ComposeNewAiDraft] polish failed', err);
      // A backend from before the route answers 404. The button stays (a control that vanishes
      // reads as broken) and says why; pressing again works once the backend has the route.
      if (getErrorStatus(err) === 404) {
        setNote({
          text: 'AI draft for new emails isn’t available on this server yet. Your text has not been changed.',
          tone: 'info',
        });
        return;
      }
      if (isAiDraftsOffError(err)) {
        refreshAiDrafts();
        setError(AI_DRAFTS_OFF_MESSAGE);
      } else if (isAiNotConfiguredError(err)) {
        setError(AI_NOT_CONFIGURED_MESSAGE);
      } else if (refusalText(err) !== undefined) {
        setError(refusalText(err) ?? '');
      } else if (getErrorStatus(err) === 429) {
        setError('AI limit reached for now — try again shortly.');
      } else {
        setError(getApiErrorMessage(err) || 'The assistant is unavailable right now.');
      }
    } finally {
      if (mounted.current) setBusyAndReport(false);
    }
  };

  const undo = () => {
    if (previous === null) return;
    setContent(previous);
    setPrevious(null);
    setError(null);
  };

  // Hidden where it cannot work; Undo stays while text a draft replaced is still to restore.
  if ((aiDraftsOff || !aiConfigured) && previous === null) return null;

  // Fixed footprint (owner, 2026-10-19: "buttons are jumping"): the label never changes while
  // drafting (a spinner takes the icon's place), Undo keeps its slot while there is nothing to
  // undo, and messages go to the host's note line instead of a row inside the footer.
  const canUndo = previous !== null && !busy;
  const undoButton = (
    <Button
      type="button"
      variant="ghost"
      onClick={undo}
      disabled={!canUndo}
      aria-hidden={!canUndo}
      tabIndex={canUndo ? 0 : -1}
      title="Restore what you had written"
      aria-label="Undo"
      // Icon only, so it has no text line to size it: stretch to the row like the labelled chips
      // (it sat a few px shorter than AI draft and Translate on staging).
      className={`${COMPOSER_TOOL} h-auto self-stretch !px-[7px] ${canUndo ? '' : 'invisible'}`}
    >
      <Undo2 className="w-3 h-3" />
    </Button>
  );
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        onClick={() => void draft()}
        disabled={disabled || busy || empty || aiDraftsOff || !aiConfigured}
        aria-busy={busy}
        data-ai-draft
        title={empty ? EMPTY_DRAFT_HINT : 'Rewrite what you typed into a ready-to-send email'}
        className={`${COMPOSER_AI_TOOL} disabled:opacity-50`}
      >
        {busy ? <Spinner size={12} className="text-ai" /> : <Sparkles className="w-3 h-3" />}
        AI draft
      </Button>
      {undoSlot ? createPortal(undoButton, undoSlot) : undoButton}
    </>
  );
}
