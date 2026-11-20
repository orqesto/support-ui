import { Sparkles, BookOpen } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { stripHtml } from '@/lib/stripHtml';
import {
  ghostCaption,
  insertSourceOf,
  PHONE_THREAD_AVATAR,
  PHONE_THREAD_BUBBLE,
  PHONE_THREAD_COL_OUT,
  PHONE_THREAD_ROW,
  type GhostOption,
} from './messageDetailConstants';

type Props = {
  aiLoading: boolean;
  ghostVisible: boolean;
  ghostOption: GhostOption | null;
  autoReply: { sent?: boolean } | undefined;
  composer: string;
  composerMode: 'reply' | 'note';
  resolved: boolean;
  /**
   * The last message in the thread is ours (an agent's or the auto-reply's reply): the stored
   * draft answered an email that has been answered, so nothing is suggested until the customer
   * writes again.
   */
  answered?: boolean;
  /**
   * The customer's latest email only thanked or confirmed (backend noReplyNeeded.ts): no AI draft
   * was made on purpose — said instead of "No suggestion found". To reply anyway the agent types
   * what they want to say and presses AI draft (owner 2026-11-20: the KB dialog and AI draft from an
   * empty editor write nothing for such an email).
   */
  noReplyNeeded?: boolean;
  alternativeCount: number;
  onGhostClick: (answer: string, source: string) => void;
  onShowAlternatives: () => void;
};

/** No draft: why — the customer only thanked (`marked`), or nothing was found. */
const emptyNote = (marked: boolean) => (
  <div className={`flex flex-row-reverse items-start gap-[9px] w-full ${PHONE_THREAD_ROW}`}>
    <div
      className={`grid place-items-center mt-px w-[21px] h-[21px] rounded-full border border-dashed border-ai-line flex-none ${PHONE_THREAD_AVATAR}`}
    >
      <Sparkles className="w-3 h-3 text-ai" />
    </div>
    <div className="rounded-xl px-[13px] py-[9px] border border-dashed border-ai-line text-[11.5px] leading-relaxed text-muted-foreground">
      {marked ? (
        'No reply needed — the customer only thanked or confirmed. To reply anyway, type what you want to say and press AI draft.'
      ) : (
        <>
          {'No suggestion found — use the '}
          <BookOpen className="inline-block w-3 h-3 mx-0.5 align-[-1px]" />
          <span className="font-mono text-[10px]">KB</span> button to search manually
        </>
      )}
    </div>
  </div>
);

export function MessageGhostBubble({
  aiLoading,
  ghostVisible,
  ghostOption,
  autoReply,
  composer,
  composerMode,
  resolved,
  answered = false,
  noReplyNeeded = false,
  alternativeCount,
  onGhostClick,
  onShowAlternatives,
}: Props) {
  const empty = !composer || composer === '<p></p>';
  const zoneOpen = empty && composerMode === 'reply' && !resolved && !answered;
  const showZone = !autoReply?.sent && zoneOpen;
  // An auto-reply on an EARLIER email hides suggestions, but not the note for the customer's latest
  // thank-you — the note only (no spinner, no draft).
  if (!showZone) return zoneOpen && noReplyNeeded && !ghostOption ? emptyNote(true) : null;
  // No draft on purpose: the note, not the similar-search spinner (aiLoading) first.
  if (noReplyNeeded && !ghostOption) return emptyNote(true);

  if (aiLoading) {
    return (
      <div className={`flex flex-row-reverse items-start gap-[9px] w-full ${PHONE_THREAD_ROW}`}>
        <div
          className={`grid place-items-center mt-px w-[21px] h-[21px] rounded-full border border-dashed border-ai-line flex-none ${PHONE_THREAD_AVATAR}`}
        >
          <Spinner size={12} className="text-ai" />
        </div>
        <div className="rounded-xl px-[13px] py-[11px] border border-dashed border-ai-line text-[12.5px] leading-relaxed">
          <span className="text-muted-foreground">Generating suggestion…</span>
        </div>
      </div>
    );
  }

  if (!aiLoading && !ghostOption) return emptyNote(false);

  if (!ghostVisible || !ghostOption) return null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onGhostClick(ghostOption.answer, insertSourceOf(ghostOption))}
      // Only Enter on the bubble itself inserts it: Enter on its "+N more" button is that
      // button's press, and inserting first replaced the reply as a side effect.
      onKeyDown={(event) =>
        event.target === event.currentTarget &&
        event.key === 'Enter' &&
        onGhostClick(ghostOption.answer, insertSourceOf(ghostOption))
      }
      // v3: an outbound-side row in the AI role — dashed teal, so it can never be mistaken for
      // a reply that was actually sent.
      className={`flex flex-row-reverse items-start gap-[9px] w-full group cursor-pointer focus-visible:outline-none ${PHONE_THREAD_ROW}`}
    >
      <div
        className={`grid place-items-center mt-px w-[21px] h-[21px] rounded-full border border-dashed border-ai-line text-ai flex-none ${PHONE_THREAD_AVATAR}`}
      >
        <Sparkles className="w-3 h-3" />
      </div>
      <div className={`flex flex-col items-end gap-1 min-w-0 max-w-[90%] ${PHONE_THREAD_COL_OUT}`}>
        <div className="flex items-center gap-1.5 font-display text-[10.5px] tracking-[0.03em] text-ai">
          <span className="inline-flex items-center h-[17px] px-1.5 rounded-[5px] border border-ai-line bg-ai-muted text-[9.5px] tracking-[0.09em] font-semibold uppercase">
            {ghostOption.insertSource === 'knowledge_base'
              ? 'KB'
              : ghostOption.type === 'documentation'
                ? 'Docs'
                : ghostOption.type}
          </span>
          {/* The pill already names the type; the caption carries what the pill cannot. */}
          <span>{ghostCaption(ghostOption)}</span>
          {alternativeCount > 1 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(event) => {
                event.stopPropagation();
                onShowAlternatives();
              }}
              className="p-0 h-auto text-[10.5px] font-display text-ai hover:text-ai/80 underline transition-colors"
            >
              +{alternativeCount - 1} more
            </Button>
          )}
        </div>
        <div
          className={`rounded-xl px-[13px] py-[11px] border border-dashed border-ai-line bg-transparent text-muted-foreground group-hover:bg-ai-muted group-hover:text-foreground group-focus-visible:bg-ai-muted text-[13.5px] leading-[1.62] text-left transition-colors ${PHONE_THREAD_BUBBLE}`}
        >
          {/* Preview only — suggestions are rich text, so the raw markup would
              otherwise show as literal "<p>Hello…</p>". The click handler above
              still passes the ORIGINAL html, which is what the composer wants. */}
          {stripHtml(ghostOption.answer)}
          <span className="block mt-2 font-display text-[10px] tracking-[0.09em] uppercase font-semibold text-ai">
            Tap to insert into reply
          </span>
        </div>
      </div>
    </div>
  );
}
