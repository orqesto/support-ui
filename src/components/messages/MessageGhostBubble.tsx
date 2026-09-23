import { Sparkles, BookOpen } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { stripHtml } from '@/lib/stripHtml';
import { ghostCaption, type GhostOption } from './messageDetailConstants';

type Props = {
  aiLoading: boolean;
  ghostVisible: boolean;
  ghostOption: GhostOption | null;
  autoReply: { sent?: boolean } | undefined;
  composer: string;
  composerMode: 'reply' | 'note';
  resolved: boolean;
  alternativeCount: number;
  onGhostClick: (answer: string, source: string) => void;
  onShowAlternatives: () => void;
};

export function MessageGhostBubble({
  aiLoading,
  ghostVisible,
  ghostOption,
  autoReply,
  composer,
  composerMode,
  resolved,
  alternativeCount,
  onGhostClick,
  onShowAlternatives,
}: Props) {
  const empty = !composer || composer === '<p></p>';
  const showZone = !autoReply?.sent && empty && composerMode === 'reply' && !resolved;

  if (!showZone) return null;

  if (aiLoading) {
    return (
      <div className="flex flex-row-reverse items-start gap-[9px] w-full">
        <div className="grid place-items-center mt-px w-[21px] h-[21px] rounded-full border border-dashed border-ai-line flex-none">
          <Spinner size={12} className="text-ai" />
        </div>
        <div className="rounded-xl px-[13px] py-[11px] border border-dashed border-ai-line text-[12.5px] leading-relaxed">
          <span className="text-muted-foreground">Generating suggestion…</span>
        </div>
      </div>
    );
  }

  if (!aiLoading && !ghostOption) {
    return (
      <div className="flex flex-row-reverse items-start gap-[9px] w-full">
        <div className="grid place-items-center mt-px w-[21px] h-[21px] rounded-full border border-dashed border-ai-line flex-none">
          <Sparkles className="w-3 h-3 text-ai" />
        </div>
        <div className="rounded-xl px-[13px] py-[9px] border border-dashed border-ai-line text-[11.5px] leading-relaxed text-muted-foreground">
          No suggestion found — use the{' '}
          <BookOpen className="inline-block w-3 h-3 mx-0.5 align-[-1px]" />
          <span className="font-mono text-[10px]">KB</span> button to search manually
        </div>
      </div>
    );
  }

  if (!ghostVisible || !ghostOption) return null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() =>
        onGhostClick(
          ghostOption.answer,
          ghostOption.type === 'lead'
            ? 'lead_qualification'
            : ghostOption.type === 'similar'
              ? 'message'
              : 'documentation'
        )
      }
      onKeyDown={(event) =>
        event.key === 'Enter' &&
        onGhostClick(
          ghostOption.answer,
          ghostOption.type === 'lead'
            ? 'lead_qualification'
            : ghostOption.type === 'similar'
              ? 'message'
              : 'documentation'
        )
      }
      // v3: an outbound-side row in the AI role — dashed teal, so it can never be mistaken for
      // a reply that was actually sent.
      className="flex flex-row-reverse items-start gap-[9px] w-full group cursor-pointer focus-visible:outline-none"
    >
      <div className="grid place-items-center mt-px w-[21px] h-[21px] rounded-full border border-dashed border-ai-line text-ai flex-none">
        <Sparkles className="w-3 h-3" />
      </div>
      <div className="flex flex-col items-end gap-1 min-w-0 max-w-[90%]">
        <div className="flex items-center gap-1.5 font-display text-[10.5px] tracking-[0.03em] text-ai">
          <span className="inline-flex items-center h-[17px] px-1.5 rounded-[5px] border border-ai-line bg-ai-muted text-[9.5px] tracking-[0.09em] font-semibold uppercase">
            {ghostOption.type === 'documentation' ? 'Docs' : ghostOption.type}
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
        <div className="rounded-xl px-[13px] py-[11px] border border-dashed border-ai-line bg-transparent text-muted-foreground group-hover:bg-ai-muted group-hover:text-foreground group-focus-visible:bg-ai-muted text-[13.5px] leading-[1.62] text-left transition-colors">
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
