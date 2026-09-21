import { Sparkles, BookOpen } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { stripHtml } from '@/lib/stripHtml';
import type { GhostOption } from './messageDetailConstants';

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
      <div className="flex flex-row-reverse gap-2 w-full">
        <div className="flex flex-shrink-0 justify-center items-center mt-1 w-6 h-6 bg-ai-muted rounded-full ring-1 ring-ai-line">
          <Spinner size={12} className="text-ai" />
        </div>
        <div className="rounded-lg px-3 py-2 border border-dashed border-ai-line bg-ai-muted/50 text-[12px] leading-relaxed">
          <span className="text-muted-foreground/60">Generating suggestion…</span>
        </div>
      </div>
    );
  }

  if (!aiLoading && !ghostOption) {
    return (
      <div className="flex flex-row-reverse gap-2 w-full">
        <div className="flex flex-shrink-0 justify-center items-center mt-1 w-6 h-6 bg-ai-muted/50 rounded-full ring-1 ring-ai-line/50">
          <Sparkles className="w-3 h-3 text-ai/50" />
        </div>
        <div className="rounded-lg px-3 py-2 border border-dashed border-ai-line bg-ai-muted/20 text-[11px] leading-relaxed text-muted-foreground/60">
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
      onClick={() => onGhostClick(ghostOption.answer, ghostOption.type === 'lead' ? 'lead_qualification' : ghostOption.type === 'similar' ? 'message' : 'documentation')}
      onKeyDown={(event) => event.key === 'Enter' && onGhostClick(ghostOption.answer, ghostOption.type === 'lead' ? 'lead_qualification' : ghostOption.type === 'similar' ? 'message' : 'documentation')}
      className="flex flex-row-reverse gap-2 w-full group cursor-pointer"
    >
      <div className="flex flex-shrink-0 justify-center items-center mt-1 w-6 h-6 bg-ai-muted rounded-full ring-1 ring-ai-line">
        <Sparkles className="w-3 h-3 text-ai" />
      </div>
      <div className="flex flex-col items-end max-w-[88%]">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-mono text-[9px] text-ai">
            AI · {ghostOption.label}
          </span>
          <span className="text-[9px] text-foreground/45 group-hover:text-foreground/70 transition-colors">
            tap to use
          </span>
          {alternativeCount > 1 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(event) => {
                event.stopPropagation();
                onShowAlternatives();
              }}
              className="p-0 h-auto text-[9px] font-mono text-ai hover:text-ai/80 underline transition-colors"
            >
              +{alternativeCount - 1} more
            </Button>
          )}
        </div>
        <div className="rounded-lg px-3 py-2 border border-dashed border-ai-line bg-ai-muted/50 text-muted-foreground group-hover:text-foreground group-hover:border-ai-line text-[12px] leading-relaxed text-left transition-colors">
          {/* Preview only — suggestions are rich text, so the raw markup would
              otherwise show as literal "<p>Hello…</p>". The click handler above
              still passes the ORIGINAL html, which is what the composer wants. */}
          {stripHtml(ghostOption.answer)}
        </div>
      </div>
    </div>
  );
}
