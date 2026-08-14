import { useState } from 'react';
import { Sparkles, Undo2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Textarea } from '@/components/ui/Textarea';
import { useAiConfigured } from '@/hooks/useAiConfigured';
import { isBlankRichText } from '@/lib/stripHtml';
import { logger } from '@/lib/logger';
import { messageService } from '@/services/message.service';
import { answerToEditorHtml, MONO } from './messageDetailConstants';

// The three variants the client asked for, mapped onto two buttons:
//   "Write reply"          → generate (no instructions) | guided (with instructions)
//   "Make it customer-ready" → polish (rewrites what is already in the composer)
type Mode = 'generate' | 'guided' | 'polish';

type Props = {
  messageId: number;
  composer: string;
  setComposer: (html: string) => void;
  disabled?: boolean;
  /** Focus the editor after text lands in it. */
  onApplied?: () => void;
};

const MAX_INSTRUCTIONS = 2000;

export function ComposerAiActions({
  messageId,
  composer,
  setComposer,
  disabled,
  onApplied,
}: Props) {
  const [open, setOpen] = useState(false);
  const [instructions, setInstructions] = useState('');
  const [busy, setBusy] = useState<Mode | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The agent's text as it was BEFORE we replaced it. Undo must always be
  // available — an AI rewrite that silently destroys what someone typed is
  // the one failure that makes people stop trusting the feature.
  const [previous, setPrevious] = useState<string | null>(null);
  // Orgs with no provider connected (staging, fresh self-hosted) get a 403 from the
  // endpoint's requireAICapability guard. Hide the button rather than let an agent
  // click into an error they cannot act on.
  const { aiConfigured } = useAiConfigured();

  const composerIsEmpty = isBlankRichText(composer);

  const run = async (mode: Mode) => {
    setBusy(mode);
    setError(null);
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
            : 'No answer could be drafted from the knowledge base. Try adding what it should say, or use the KB button.'
        );
        return;
      }

      setPrevious(composer);
      setComposer(answerToEditorHtml(text));
      setOpen(false);
      setInstructions('');
      onApplied?.();
    } catch (err) {
      logger.error('Compose-reply failed:', err);
      // 429 = per-org AI cap or the per-minute limiter; both mean "not now".
      const status = (err as { response?: { status?: number } })?.response?.status;
      setError(
        status === 429
          ? 'AI limit reached for now — try again shortly.'
          : status === 403
            ? 'No AI provider is connected for this workspace. An admin can add one in Settings.'
            : 'The assistant is unavailable right now. Your text is unchanged.'
      );
    } finally {
      setBusy(null);
    }
  };

  const undo = () => {
    if (previous === null) return;
    setComposer(previous);
    setPrevious(null);
    onApplied?.();
  };

  // Undo must survive the hook flipping to false mid-edit, so bail out only when
  // there is nothing pending to restore.
  if (!aiConfigured && previous === null) return null;

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
              onClick={() => setOpen(false)}
              className="p-0 w-auto h-auto text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>

          <Textarea
            value={instructions}
            onChange={(event) => setInstructions(event.target.value.slice(0, MAX_INSTRUCTIONS))}
            rows={2}
            disabled={busy !== null}
            placeholder="Optional — what should the reply say? e.g. the parcel is held at the border, we're sending a replacement"
            className="text-[13px]"
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => void run(instructions.trim() ? 'guided' : 'generate')}
              disabled={busy !== null}
              size="sm"
            >
              {busy === 'generate' || busy === 'guided' ? (
                <span className="flex items-center gap-1.5">
                  <Spinner size={12} />
                  Writing…
                </span>
              ) : instructions.trim() ? (
                'Write reply with these points'
              ) : (
                'Write reply'
              )}
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => void run('polish')}
              disabled={busy !== null || composerIsEmpty}
              title={
                composerIsEmpty
                  ? 'Type your rough version first — this rewrites it for the customer'
                  : 'Rewrite what you typed so it can be sent to the customer'
              }
            >
              {busy === 'polish' ? (
                <span className="flex items-center gap-1.5">
                  <Spinner size={12} />
                  Rewriting…
                </span>
              ) : (
                'Make it customer-ready'
              )}
            </Button>

            {previous !== null && (
              <Button variant="ghost" size="sm" onClick={undo} disabled={busy !== null}>
                <span className="flex items-center gap-1">
                  <Undo2 className="w-3.5 h-3.5" />
                  Undo
                </span>
              </Button>
            )}
          </div>

          {error && <p className="text-[12px] text-destructive">{error}</p>}

          <p className="text-[11px] text-muted-foreground">
            Drafts are written in the customer&apos;s language. Always read before sending.
          </p>
        </div>
      )}
    </>
  );
}
