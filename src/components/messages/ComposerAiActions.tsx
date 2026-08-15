import { useState } from 'react';
import { Sparkles, Undo2, X, Languages } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Textarea } from '@/components/ui/Textarea';
import { useAiConfigured } from '@/hooks/useAiConfigured';
import { isBlankRichText, stripHtml } from '@/lib/stripHtml';
import { logger } from '@/lib/logger';
import { messageService } from '@/services/message.service';
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

type Draft = { text: string; language?: string; mode: Mode };

type Props = {
  messageId: number;
  composer: string;
  setComposer: (html: string) => void;
  disabled?: boolean;
  /** Focus the editor after text lands in it. */
  onApplied?: () => void;
};

const MAX_INSTRUCTIONS = 2000;
/** Language the agent reads; a draft in anything else offers a translation. */
const AGENT_LANGUAGE = 'en';
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
  const [translation, setTranslation] = useState<string | null>(null);
  const [showTranslation, setShowTranslation] = useState(false);
  const [translating, setTranslating] = useState(false);
  // The agent's text as it was BEFORE we replaced it. Undo must always be
  // available — an AI rewrite that destroys what someone typed is the one
  // failure that makes people stop trusting the feature.
  const [previous, setPrevious] = useState<string | null>(null);

  const { aiConfigured } = useAiConfigured();
  const ownText = stripHtml(composer).trim();
  const hasOwnText = !isBlankRichText(composer);

  const describeError = (err: unknown): string => {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 429) return 'AI limit reached for now — try again shortly.';
    if (status === 403)
      return 'No AI provider is connected for this workspace. An admin can add one in Settings.';
    return 'The assistant is unavailable right now. Your text is unchanged.';
  };

  const run = async (mode: Mode) => {
    setBusy(true);
    setError(null);
    setTranslation(null);
    setShowTranslation(false);
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
      setDraft({ text, language: response.data?.language, mode });
    } catch (err) {
      logger.error('Compose-reply failed:', err);
      setError(describeError(err));
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
    setPrevious(composer);
    setComposer(answerToEditorHtml(draft.text));
    setDraft(null);
    setInstructions('');
    setStartFresh(false);
    setOpen(false);
    onApplied?.();
  };

  const discard = () => {
    setDraft(null);
    setTranslation(null);
    setShowTranslation(false);
  };

  const undo = () => {
    if (previous === null) return;
    setComposer(previous);
    setPrevious(null);
    onApplied?.();
  };

  const toggleTranslation = async () => {
    if (!draft) return;
    if (showTranslation) {
      setShowTranslation(false);
      return;
    }
    if (translation) {
      setShowTranslation(true);
      return;
    }
    setTranslating(true);
    try {
      const response = await messageService.translateText(draft.text, AGENT_LANGUAGE);
      const content = response.data?.translated?.content;
      if (!content) {
        setError('Could not translate this draft.');
        return;
      }
      setTranslation(content);
      setShowTranslation(true);
    } catch (err) {
      logger.error('Draft translation failed:', err);
      setError(describeError(err));
    } finally {
      setTranslating(false);
    }
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

  const canTranslate = !!draft?.language && draft.language !== AGENT_LANGUAGE;
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
                {canTranslate && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void toggleTranslation()}
                    disabled={translating}
                    className="flex items-center gap-1 px-1.5 py-0.5 h-auto text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    {translating ? <Spinner size={11} /> : <Languages className="w-3 h-3" />}
                    {showTranslation ? 'Show original' : 'Show in English'}
                  </Button>
                )}
              </div>

              <div className="overflow-y-auto p-2 max-h-44 text-[13px] leading-relaxed whitespace-pre-wrap rounded border border-border bg-muted/30">
                {showTranslation && translation ? translation : draft.text}
              </div>
              {showTranslation && (
                <p className="text-[11px] text-muted-foreground">
                  Translation is for checking — the {draft.language?.toUpperCase()} version is what
                  gets used.
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
                placeholder="Optional — leave empty and I'll answer from your knowledge base. e.g. the parcel is held at the border, we're sending a replacement"
                className="text-[13px]"
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
