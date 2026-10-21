import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { RotateCcw, Sparkles, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useAiConfigured } from '@/hooks/useAiConfigured';
import { useAiDraftsOff, useRefreshAiDrafts } from '@/hooks/useAiDraftsOff';
import { editorHtmlToText } from '@/lib/editorText';
import { normalizeEditorHtml } from '@/lib/editorSchema';
import { isBlankRichText } from '@/lib/stripHtml';
import { envelopeDraftHint, readEnvelope, type EnvelopeSummary } from '@/lib/messageEnvelope';
import { logger } from '@/lib/logger';
import { hasTemplatePlaceholders } from '@/lib/replyPlaceholders';
import {
  AI_DRAFTS_OFF_MESSAGE,
  AI_NOT_CONFIGURED_MESSAGE,
  getApiErrorMessage,
  getErrorStatus,
  isAiDraftsOffError,
  isAiNotConfiguredError,
} from '@/lib/errorMessages';
import { messageService, type AiDraft } from '@/services/message.service';
import { answerToEditorHtml, COMPOSER_AI_TOOL, LABEL } from './messageDetailConstants';

/**
 * AI drafting for the reply composer — ONE input: the reply editor itself.
 *
 * Empty editor → a reply from the knowledge base (`generate`). Text in the editor → that text is
 * the agent's note (`guided`): the reply comes from the knowledge base plus their facts, and the
 * backend falls back to writing from the note alone when the knowledge base has nothing. The draft
 * replaces the editor content in place; Undo puts the agent's text back.
 *
 * (The previous version was a panel with three text areas — a read-only preview, a note box and
 * the editor underneath — so "here are my facts, write the reply" had two places to type it.)
 */
type Mode = 'generate' | 'guided' | 'polish';

/**
 * Provenance stamp sent with the reply so the backend can record that this text
 * was AI-drafted. Must stay in sync with COMPOSER_AI_SOURCE_PREFIX in the BE's
 * messageReplyTrainingData — the BE branches on this prefix to avoid crediting
 * an unrelated saved suggestion for a composer-written reply.
 */
export const composerAiSource = (mode: Mode): string => `ai_compose_${mode}`;

type Props = {
  messageId: number;
  composer: string;
  setComposer: (html: string) => void;
  disabled?: boolean;
  /**
   * Focus the editor after text lands in it, and report WHICH AI mode produced
   * the text now sitting in the composer so the send can be stamped as
   * AI-drafted. Called with null on undo — the agent's own text is back, so the
   * reply is no longer AI-authored.
   *
   * The second argument is the draft AS APPLIED (editor HTML, not the plain text
   * the endpoint returned) so the send can carry it for reply_style capture: the
   * BE diffs it against the sent body verbatim, and that body is composer HTML.
   * Undefined on undo, for the same reason `source` is null there.
   */
  onApplied?: (source: string | null, draft?: AiDraft) => void;
  /**
   * Reports a request in flight, so the host can lock the editor (the draft is about to replace
   * it) and the phone composer never folds away mid-request.
   */
  onBusyChange?: (busy: boolean) => void;
};

/**
 * ⛔ MIRRORS `MAX_INSTRUCTIONS_CHARS` in the backend, which applies a plain `.slice()` to the note.
 * Text longer than that is a reply the agent wrote, not a note: it goes to `polish` (the backend
 * takes a draft up to MAX_DRAFT_CHARS, 8000) instead of being cut in half where nobody sees it.
 */
export const MAX_INSTRUCTIONS = 2000;
/** The backend's MAX_DRAFT_CHARS for `polish`. */
const MAX_DRAFT = 8000;

/** The only 409 compose-reply issues on generate/guided: the thread has no inbound turn to answer. */
const NO_INBOUND_GUIDANCE = 'Write the reply yourself in the editor, then press AI draft.';
const isNoInbound = (err: unknown): boolean =>
  getErrorStatus(err) === 409 && !isAiDraftsOffError(err);

/** What the last applied draft was made from — "Try again" re-asks with exactly this. */
type Applied = {
  mode: Mode;
  /** The agent's text the draft was made from: the note (guided) or the draft (polish). */
  input: string;
  /**
   * The draft as it went into the editor — in the EDITOR's serialisation (normalizeEditorHtml),
   * so the badge's "still as it landed" is an exact comparison and holds only while the draft is
   * unchanged.
   */
  html: string;
  language?: string;
  groundedInKb?: boolean;
  /** Where the team stands on the email answered — only copied, not listed, a colleague's. */
  envelope?: EnvelopeSummary | null;
};

export function ComposerAiActions({
  messageId,
  composer,
  setComposer,
  disabled,
  onApplied,
  onBusyChange,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<Applied | null>(null);
  // The agent's text as it was BEFORE the first draft replaced it. Undo must always be
  // available — an AI rewrite that destroys what someone typed is the one failure that makes
  // people stop trusting the feature. Try again keeps the ORIGINAL, not the previous draft.
  const [previous, setPrevious] = useState<string | null>(null);

  // The composer as of the last render, read when a response lands.
  const latestComposer = useRef(composer);
  latestComposer.current = composer;
  /*
    ⛔ This component is REMOUNTED per conversation (see the `key` where it is used). A response
    for the thread the agent just left must not land in the next customer's reply.
  */
  //
  // Set true in the effect BODY, not only by `useRef(true)`: React StrictMode (the dev server)
  // mounts, cleans up and mounts again, and a ref only ever set false by the cleanup stayed false
  // — every draft was then discarded and the button sat on "Drafting…" (demo, 2026-10-15).
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const reportBusy = useRef(onBusyChange);
  reportBusy.current = onBusyChange;
  useLayoutEffect(() => {
    reportBusy.current?.(busy);
  }, [busy]);
  useLayoutEffect(() => () => reportBusy.current?.(false), []);

  const { aiConfigured } = useAiConfigured();
  const { off: aiDraftsOff } = useAiDraftsOff();
  const refreshAiDrafts = useRefreshAiDrafts();

  /**
   * What went wrong, in the agent's words. The BE's 4xx copy is the message ("This conversation
   * has no customer message to answer"); the generic line is only for 5xx / network drops.
   * 429/403 come first: copy tuned for this spot, and their BE wording is longer.
   */
  const describeError = (err: unknown): string => {
    const status = getErrorStatus(err);
    if (isAiDraftsOffError(err)) return AI_DRAFTS_OFF_MESSAGE;
    if (isAiNotConfiguredError(err)) return AI_NOT_CONFIGURED_MESSAGE;
    if (status === 429) return 'AI limit reached for now — try again shortly.';
    if (status === 403)
      return 'No AI provider is connected for this workspace. An admin can add one in Settings.';
    return getApiErrorMessage(err) || 'The assistant is unavailable right now.';
  };

  /**
   * Ask for a draft and put it in the editor.
   *
   * `restoreTo` is what Undo brings back: the editor as it is now on a first draft, the original
   * text on Try again (so Undo after three retries is still the agent's own words).
   */
  const request = (mode: Mode, input: string) =>
    messageService.composeReply(messageId, {
      mode,
      ...(mode === 'guided' ? { instructions: input } : {}),
      ...(mode === 'polish' ? { draft: input } : {}),
    });

  const run = async (requestedMode: Mode, requestedInput: string, restoreTo: string) => {
    const before = latestComposer.current;
    let mode = requestedMode;
    let input = requestedInput;
    setBusy(true);
    setError(null);
    try {
      let response;
      try {
        response = await request(mode, input);
      } catch (err) {
        /*
          A thread with no customer message (it opens with our own outbound mail) has nothing for
          a note to answer — but the agent's text can still be made sendable: polish needs only
          the text. The old panel offered this as "Make it customer-ready"; here it is automatic.
        */
        if (mode !== 'guided' || !isNoInbound(err) || !mounted.current) throw err;
        mode = 'polish';
        input = before;
        response = await request(mode, input);
      }
      if (!mounted.current) return;
      const text = response.data?.text;
      if (!text) {
        setError('Nothing could be drafted. Add a note in the editor saying what to cover.');
        return;
      }
      // The editor is locked while this runs, but a template or a lookup record can still land
      // in it. Overwriting text the agent watched arrive would lose it with no undo entry.
      if (latestComposer.current !== before) {
        setError('The reply changed while drafting — press AI draft again.');
        return;
      }
      // In the editor's own serialisation: the record sent for reply_style (diffed against the sent
      // body, which IS editor HTML) and the badge's comparison both match an untouched draft.
      const html = normalizeEditorHtml(answerToEditorHtml(text));
      setPrevious(restoreTo);
      setComposer(html);
      setApplied({
        mode,
        input,
        html,
        language: response.data?.language,
        groundedInKb: response.data?.groundedInKb,
        envelope: readEnvelope(response.data?.envelope),
      });
      onApplied?.(composerAiSource(mode), {
        text: html,
        mode,
        ...(response.data?.language && { language: response.data.language }),
      });
    } catch (err) {
      if (!mounted.current) return;
      logger.error('Compose-reply failed:', err);
      // Drafts were switched off after this screen loaded — re-read, so the button gives way to
      // the note below instead of offering a control that cannot work.
      if (isAiDraftsOffError(err)) refreshAiDrafts();
      const message = describeError(err);
      if (isNoInbound(err) && mode === 'generate') {
        // The backend's sentence has no full stop ("…to answer"), so the guidance ran on into it.
        const base = message.trim();
        const ended = /[.!?…)"'”’]$/.test(base);
        setError(
          base ? `${ended ? base : `${base}.`} ${NO_INBOUND_GUIDANCE}` : NO_INBOUND_GUIDANCE
        );
      } else {
        setError(message);
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const draft = () => {
    // Pressed again over an applied draft: Undo must still reach the agent's OWN text, not the
    // draft this one replaces.
    const restoreTo = previous ?? composer;
    // Links keep their URL (`here (https://…)`): stripped, "see the guide" lost where it pointed.
    // ONE reading decides both "blank" and the note, so a non-blank editor never sends an empty note.
    const text = editorHtmlToText(composer);
    if (!text) {
      void run('generate', '', restoreTo);
      return;
    }
    if (text.length > MAX_DRAFT) {
      setError(
        `Too long for AI draft (${MAX_DRAFT.toLocaleString()} characters) — shorten it, or clear the editor to draft from scratch.`
      );
      return;
    }
    /*
      A reply template (placeholders) is a draft to adapt: `polish` is the only mode that fills
      placeholders for this thread before the model sees them — as a note it would get raw tokens.
      So is anything longer than a note can be. The rest is the agent's note.
    */
    if (hasTemplatePlaceholders(composer) || text.length > MAX_INSTRUCTIONS) {
      void run('polish', composer, restoreTo);
      return;
    }
    void run('guided', text, restoreTo);
  };

  const retry = () => {
    if (!applied || previous === null) return;
    void run(applied.mode, applied.input, previous);
  };

  const undo = () => {
    if (previous === null) return;
    setComposer(previous);
    setPrevious(null);
    setApplied(null);
    setError(null);
    // The agent's own text is back in the composer — this reply is theirs again.
    onApplied?.(null);
  };

  // AI drafts off: say so where the button was — a control that silently disappears reads as a
  // bug. Undo stays reachable: text a draft replaced before the switch is still the agent's.
  // Ahead of the no-provider check: with drafts off, the admin's choice is WHY there is no
  // button, whether or not a provider is connected.
  if (aiDraftsOff && previous === null) {
    return (
      <span className="text-[11px] text-muted-foreground" data-testid="ai-drafts-off-note">
        {AI_DRAFTS_OFF_MESSAGE}
      </span>
    );
  }

  // No provider connected → the endpoint 403s, so offering the button is a dead
  // end. Stay mounted only while an undo is still pending.
  if (!aiConfigured && previous === null) return null;

  const offline = aiDraftsOff || !aiConfigured;

  return (
    <>
      <Button
        variant="ghost"
        onClick={draft}
        disabled={disabled || busy || offline}
        data-ai-draft
        title={
          isBlankRichText(composer)
            ? 'Write a reply from the knowledge base'
            : 'Turn what you typed into a reply'
        }
        aria-busy={busy}
        className={COMPOSER_AI_TOOL}
      >
        {busy ? <Spinner size={12} /> : <Sparkles className="w-3 h-3" />}
        {busy ? 'Drafting…' : 'AI draft'}
      </Button>

      {/* The draft is in the editor: what it is, and the two ways back out of it. */}
      {previous !== null && !busy && (
        <div className="inline-flex items-center gap-1" data-testid="ai-draft-status">
          {/* Only while the draft is as it landed: after Translate it is in another language. */}
          {applied?.language && composer === applied.html && (
            <span className={`${LABEL} text-ai`} title="Written in the customer's language">
              {applied.language.toUpperCase()}
            </span>
          )}
          <Button
            variant="ghost"
            onClick={undo}
            title="Restore what you had written"
            className="flex items-center gap-1 px-2 py-1 h-auto rounded text-muted-foreground hover:text-foreground"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span className={LABEL}>undo</span>
          </Button>
          {applied && !offline && (
            <Button
              variant="ghost"
              onClick={retry}
              disabled={disabled}
              title="Write another version from the same text"
              className="flex items-center gap-1 px-2 py-1 h-auto rounded text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className={LABEL}>try again</span>
            </Button>
          )}
        </div>
      )}

      {/*
        Say it out loud when nothing backed this draft. The two ungrounded modes fail differently:
        a guided draft carries the agent's OWN facts, a generate draft with an empty KB answers
        nothing and must not be sent as if it did.
      */}
      {/* Not on a draft written for mail the team was only copied on (or a colleague's): there
          was no question for us to answer, so "add the answer" would be wrong advice — the
          envelope hint below explains that draft instead. A guided draft keeps its warning. */}
      {applied?.groundedInKb === false &&
        !busy &&
        (applied.mode === 'guided' || !envelopeDraftHint(applied.envelope ?? null)) && (
          <p className="basis-full order-last text-[11px] text-warning">
            {applied.mode === 'guided'
              ? 'Written from what you said, not from the knowledge base — check the facts before sending.'
              : 'Nothing in the knowledge base matched, so this acknowledges the question without answering it. Add the answer before sending.'}
          </p>
        )}
      {/* Copied / not listed / a colleague's mail: the draft was written for that, say so. */}
      {applied && envelopeDraftHint(applied.envelope ?? null) && !busy && (
        <p
          className="basis-full order-last text-[11px] text-muted-foreground"
          data-testid="ai-draft-envelope-hint"
        >
          {envelopeDraftHint(applied.envelope ?? null)}
        </p>
      )}
      {error && (
        <p className="basis-full order-last text-[12px] text-destructive" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
