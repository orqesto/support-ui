import { useState } from 'react';
import { Sparkles, Undo2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Textarea } from '@/components/ui/Textarea';
import { TranslateButton } from '@/components/shared/TranslateButton';
import { useAiConfigured } from '@/hooks/useAiConfigured';
import { isBlankRichText, stripHtml } from '@/lib/stripHtml';
import { logger } from '@/lib/logger';
import {
  AI_NOT_CONFIGURED_MESSAGE,
  getApiErrorMessage,
  getErrorStatus,
  isAiNotConfiguredError,
} from '@/lib/errorMessages';
import { messageService, type AiDraft } from '@/services/message.service';
import { answerToEditorHtml, MONO } from './messageDetailConstants';

/**
 * AI drafting for the reply composer.
 *
 * The panel is STATE-AWARE rather than mode-aware: it shows only the action that
 * applies right now, so there is never a disabled button whose enabling condition
 * lives in some other field. Empty composer → "write me one". Composer with your
 * own text → "clean mine up", with starting fresh as an explicit secondary path.
 * (The first version exposed the three backend modes directly and put the polish
 * button's enabled state on the composer while its input box sat in the panel —
 * agents typed their draft into the panel box and the button greyed out.)
 *
 * Nothing touches the agent's text until they accept: drafts are previewed inside
 * the panel with Use it / Try again / Discard. Drafts come back in the CUSTOMER's
 * language, so the preview labels that language and can show a translation.
 */
type Mode = 'generate' | 'guided' | 'polish';

/**
 * Provenance stamp sent with the reply so the backend can record that this text
 * was AI-drafted. Must stay in sync with COMPOSER_AI_SOURCE_PREFIX in the BE's
 * messageReplyTrainingData — the BE branches on this prefix to avoid crediting
 * an unrelated saved suggestion for a composer-written reply.
 */
export const composerAiSource = (mode: Mode): string => `ai_compose_${mode}`;

/**
 * `groundedInKb: false` means the backend wrote this WITHOUT a retrieved passage —
 * guided from the agent's own facts, generate from the thread alone. The field has
 * existed since the guided fallback shipped and nothing rendered it, so an
 * ungrounded draft was indistinguishable from a KB-backed answer.
 */
type Draft = { text: string; language?: string; mode: Mode; groundedInKb?: boolean };

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
};

const MAX_INSTRUCTIONS = 2000;
/**
 * The only 409 compose-reply issues: the thread has no inbound turn to answer —
 * it opens with our own outbound mail, or the customer's side is missing. Generate
 * and guided have nothing to ground a draft in, but POLISH still works (it needs
 * only the agent's own draft), so name that way out. The bare backend sentence is
 * true and still reads as a dead end.
 */
const NO_INBOUND_GUIDANCE =
  'Write the reply yourself below, then use “Make it customer-ready”.';
/**
 * ⛔ There is no "agent language" constant here any more. The first version hardcoded
 * English and offered one "Show in English" toggle only when the draft was NOT English —
 * so a customer who writes English produced a draft with no translation control at all,
 * and an agent who reads Swedish had nothing. Every message and ticket already has a
 * language dropdown (TranslateButton); the draft gets the same one.
 */
const OWN_TEXT_PREVIEW_CHARS = 160;

export function ComposerAiActions({
  messageId,
  composer,
  setComposer,
  disabled,
  onApplied,
}: Props) {
  const [open, setOpen] = useState(false);
  const [instructions, setInstructions] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  // Set when the agent picks "write a new reply instead" while their own text is
  // still in the composer — that text is kept until they accept a draft.
  const [startFresh, setStartFresh] = useState(false);
  // The draft rendered in the language the agent picked; null shows the original.
  const [translation, setTranslation] = useState<{ content: string; language?: string } | null>(
    null
  );
  // The agent's text as it was BEFORE we replaced it. Undo must always be
  // available — an AI rewrite that destroys what someone typed is the one
  // failure that makes people stop trusting the feature.
  const [previous, setPrevious] = useState<string | null>(null);

  const { aiConfigured } = useAiConfigured();
  const ownText = stripHtml(composer).trim();
  const hasOwnText = !isBlankRichText(composer);

  /**
   * Nothing here ever edits the composer on a failure, but the agent cannot see
   * that — say so whenever there IS text of theirs at stake (the polish path).
   */
  const withTextReassurance = (message: string): string =>
    hasOwnText && !/unchanged/i.test(message) ? `${message} Your text is unchanged.` : message;

  /**
   * What went wrong, in the agent's words.
   *
   * 🪤 This used to map STATUS ONLY, so every 4xx the endpoint writes for a human to
   * read — "This conversation has no customer message to answer" (409, a thread that
   * opens with our own outbound mail), "guided mode requires instructions" (400),
   * "Message not found" (404) — was replaced by "the assistant is unavailable". That
   * reads as an outage, so the agent retries a call that CANNOT succeed on this
   * thread, and the one sentence that would have told them why was already in the
   * response body. The BE's 4xx copy is the message; keep the generic line for the
   * cases that really are "we could not reach the model" (5xx, network drop).
   *
   * `getApiErrorMessage` returns nothing for a 5xx on purpose — a server body can
   * carry a stack frame or a SQL fragment — so passing it through cannot leak one.
   * The 429/403 lines stay AHEAD of it: those two are contracts we tuned copy for,
   * and their BE wording is longer than this panel has room for.
   */
  const describeError = (err: unknown): string => {
    const status = getErrorStatus(err);
    if (isAiNotConfiguredError(err)) return AI_NOT_CONFIGURED_MESSAGE;
    if (status === 429) return 'AI limit reached for now — try again shortly.';
    if (status === 403)
      return 'No AI provider is connected for this workspace. An admin can add one in Settings.';
    const beMessage = getApiErrorMessage(err);
    if (beMessage) return withTextReassurance(beMessage);
    return 'The assistant is unavailable right now. Your text is unchanged.';
  };

  const run = async (mode: Mode) => {
    setBusy(true);
    setError(null);
    setTranslation(null);
    try {
      const response = await messageService.composeReply(messageId, {
        mode,
        ...(mode === 'guided' ? { instructions: instructions.trim() } : {}),
        ...(mode === 'polish' ? { draft: composer } : {}),
      });

      const text = response.data?.text;
      if (!text) {
        setError(
          mode === 'polish'
            ? 'Could not rewrite this draft. Your text is unchanged.'
            : 'Nothing could be drafted from the knowledge base. Try saying what the reply should cover.'
        );
        return;
      }
      setDraft({
        text,
        language: response.data?.language,
        mode,
        groundedInKb: response.data?.groundedInKb,
      });
    } catch (err) {
      logger.error('Compose-reply failed:', err);
      const message = describeError(err);
      const noInbound = getErrorStatus(err) === 409 && mode !== 'polish';
      setError(noInbound ? `${message} ${NO_INBOUND_GUIDANCE}` : message);
    } finally {
      setBusy(false);
    }
  };

  /** Re-run whatever produced the draft currently on screen. */
  const retry = () => {
    if (draft) void run(draft.mode);
  };

  const useDraft = () => {
    if (!draft) return;
    const appliedHtml = answerToEditorHtml(draft.text);
    setPrevious(composer);
    setComposer(appliedHtml);
    const appliedSource = composerAiSource(draft.mode);
    setDraft(null);
    setInstructions('');
    setStartFresh(false);
    setOpen(false);
    onApplied?.(appliedSource, {
      text: appliedHtml,
      mode: draft.mode,
      ...(draft.language && { language: draft.language }),
    });
  };

  const discard = () => {
    setDraft(null);
    setTranslation(null);
  };

  const undo = () => {
    if (previous === null) return;
    setComposer(previous);
    setPrevious(null);
    // The agent's own text is back in the composer — this reply is theirs again.
    onApplied?.(null);
  };

  const closePanel = () => {
    setOpen(false);
    discard();
    setError(null);
    setStartFresh(false);
  };

  // No provider connected → the endpoint 403s, so offering the button is a dead
  // end. Stay mounted only while an undo is still pending.
  if (!aiConfigured && previous === null) return null;

  const showOwnTextView = !busy && !draft && hasOwnText && !startFresh;
  const showWriteView = !busy && !draft && (!hasOwnText || startFresh);

  return (
    <>
      <Button
        variant="ghost"
        onClick={() => {
          setError(null);
          setOpen((wasOpen) => !wasOpen);
        }}
        disabled={disabled}
        title="Draft this reply with AI"
        aria-expanded={open}
        className="flex items-center gap-1.5 px-2.5 py-1 h-auto rounded text-violet-600 hover:text-violet-700 hover:bg-violet-50 dark:text-violet-400 dark:hover:text-violet-300 dark:hover:bg-violet-950/30 transition-colors"
      >
        <Sparkles className="w-3.5 h-3.5" />
        <span className="font-mono text-xs font-semibold">AI</span>
      </Button>

      {previous !== null && !open && (
        <Button
          variant="ghost"
          onClick={undo}
          title="Restore what you had written"
          className="flex items-center gap-1 px-2 py-1 h-auto rounded text-muted-foreground hover:text-foreground"
        >
          <Undo2 className="w-3.5 h-3.5" />
          <span className={MONO}>undo</span>
        </Button>
      )}

      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-2 z-20 rounded-lg border border-violet-200 dark:border-violet-800/60 bg-card shadow-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className={`${MONO} text-violet-600 dark:text-violet-400`}>AI draft</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close AI panel"
              onClick={closePanel}
              className="p-0 w-auto h-auto text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>

          {busy && (
            <div className="flex items-center gap-2 py-3 text-[13px] text-muted-foreground">
              <Spinner size={14} />
              Writing your draft…
            </div>
          )}

          {/* Preview — read it before it replaces anything. */}
          {!busy && draft && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground">
                  Draft
                  {draft.language ? ` — ${draft.language.toUpperCase()} (customer's language)` : ''}
                </span>
                {/*
                  Always offered, whatever language the draft is in — keyed on the text so
                  a new draft (Try again) arrives untranslated with a reset control.
                */}
                <TranslateButton
                  key={draft.text}
                  text={draft.text}
                  onTranslated={(content, _subject, language) =>
                    setTranslation({ content, language })
                  }
                  onCleared={() => setTranslation(null)}
                />
              </div>

              <div className="overflow-y-auto p-2 max-h-44 text-[13px] leading-relaxed whitespace-pre-wrap rounded border border-border bg-muted/30">
                {translation ? translation.content : draft.text}
              </div>

              {/*
                Say it out loud when nothing backed this draft. The two ungrounded modes
                fail differently and the agent's next move differs with them: a guided
                draft carries the agent's OWN facts and is ready to send, while a generate
                draft with an empty KB answers nothing and must not be sent as if it did.
              */}
              {draft.groundedInKb === false && (
                <p className="text-[11px] text-amber-600 dark:text-amber-500">
                  {draft.mode === 'guided'
                    ? 'Written from what you said, not from the knowledge base — check the facts before sending.'
                    : 'Nothing in the knowledge base matched, so this acknowledges the question without answering it. Add the answer before sending.'}
                </p>
              )}
              {translation && (
                <p className="text-[11px] text-muted-foreground">
                  Translated{translation.language ? ` to ${translation.language.toUpperCase()}` : ''}{' '}
                  for checking — the {draft.language ? draft.language.toUpperCase() : 'original'}{' '}
                  version is what gets used.
                </p>
              )}

              <div className="flex flex-wrap gap-2 items-center">
                <Button size="sm" onClick={useDraft}>
                  Use it
                </Button>
                <Button variant="ghost" size="sm" onClick={retry}>
                  Try again
                </Button>
                <Button variant="ghost" size="sm" onClick={discard}>
                  Discard
                </Button>
              </div>
            </div>
          )}

          {/* Your text is already there → offer to clean it up. */}
          {showOwnTextView && (
            <div className="space-y-2">
              <span className="text-[11px] text-muted-foreground">Your text:</span>
              <div className="p-2 text-[13px] leading-relaxed rounded border text-muted-foreground border-border bg-muted/30">
                {ownText.slice(0, OWN_TEXT_PREVIEW_CHARS)}
                {ownText.length > OWN_TEXT_PREVIEW_CHARS ? '…' : ''}
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <Button size="sm" onClick={() => void run('polish')}>
                  Make it customer-ready
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setStartFresh(true)}>
                  Write a new reply instead →
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Rewrites what you typed into something sendable, in the customer&apos;s language.
                Your facts are kept and nothing is invented.
              </p>
            </div>
          )}

          {/* Nothing to work from → write one. */}
          {showWriteView && (
            <div className="space-y-2">
              <span className="text-[11px] text-muted-foreground">What should the reply say?</span>
              <Textarea
                value={instructions}
                onChange={(event) => setInstructions(event.target.value.slice(0, MAX_INSTRUCTIONS))}
                rows={2}
                // Example stays industry-neutral on purpose: tenants range from
                // physical-product sellers to service businesses with nothing to
                // ship, and a parcel/border example reads as "not for us" to half
                // of them. What it has to convey is the SHAPE of a useful
                // instruction — case facts the knowledge base cannot know.
                placeholder="Optional — leave empty and I'll answer from your knowledge base. e.g. we've fixed it on our side, we'll follow up on Monday"
                // The DS Textarea is resize-y by default, so width is already
                // safe, but height was unbounded — dragging the handle could push
                // the Write reply button off-screen inside this compact panel.
                // max-h-44 matches the reply-preview block above it.
                className="text-[13px] max-h-44"
              />
              <div className="flex flex-wrap gap-2 items-center">
                <Button
                  size="sm"
                  onClick={() => void run(instructions.trim() ? 'guided' : 'generate')}
                >
                  Write reply
                </Button>
                {startFresh && (
                  <Button variant="ghost" size="sm" onClick={() => setStartFresh(false)}>
                    ← Back to my text
                  </Button>
                )}
              </div>
              {startFresh && (
                <p className="text-[11px] text-muted-foreground">
                  Your current text is kept until you choose <strong>Use it</strong>.
                </p>
              )}
            </div>
          )}

          {error && <p className="text-[12px] text-destructive">{error}</p>}
        </div>
      )}
    </>
  );
}
