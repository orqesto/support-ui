import { Sparkles, BookOpen } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
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
  onGhostClick: (answer: string) => void;
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
        <div className="flex flex-shrink-0 justify-center items-center mt-1 w-6 h-6 bg-violet-100 rounded-full ring-1 ring-violet-200 dark:bg-violet-950/40 dark:ring-violet-800">
          <Spinner size={12} className="text-violet-500 dark:text-violet-400" />
        </div>
        <div className="rounded-lg px-3 py-2 border border-dashed border-violet-200 dark:border-violet-800/50 bg-violet-50/50 dark:bg-violet-950/10 text-[12px] leading-relaxed">
          <span className="text-muted-foreground/60">Generating suggestion…</span>
        </div>
      </div>
    );
  }

  if (!aiLoading && !ghostOption) {
    return (
      <div className="flex flex-row-reverse gap-2 w-full">
        <div className="flex flex-shrink-0 justify-center items-center mt-1 w-6 h-6 bg-violet-100/50 rounded-full ring-1 ring-violet-200/50 dark:bg-violet-950/20 dark:ring-violet-800/40">
          <Sparkles className="w-3 h-3 text-violet-400/50 dark:text-violet-500/50" />
        </div>
        <div className="rounded-lg px-3 py-2 border border-dashed border-violet-100 dark:border-violet-800/30 bg-violet-50/20 dark:bg-violet-950/5 text-[11px] leading-relaxed text-muted-foreground/60">
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
      onClick={() => onGhostClick(ghostOption.answer)}
      onKeyDown={(e) => e.key === 'Enter' && onGhostClick(ghostOption.answer)}
      className="flex flex-row-reverse gap-2 w-full group cursor-pointer"
    >
      <div className="flex flex-shrink-0 justify-center items-center mt-1 w-6 h-6 bg-violet-100 rounded-full ring-1 ring-violet-200 dark:bg-violet-950/40 dark:ring-violet-800">
        <Sparkles className="w-3 h-3 text-violet-500 dark:text-violet-400" />
      </div>
      <div className="flex flex-col items-end max-w-[88%]">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-mono text-[9px] text-violet-600 dark:text-violet-400">
            AI · {ghostOption.label}
          </span>
          <span className="text-[9px] text-foreground/45 group-hover:text-foreground/70 transition-colors">
            tap to use
          </span>
          {alternativeCount > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onShowAlternatives();
              }}
              className="text-[9px] font-mono text-violet-500 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 underline transition-colors"
            >
              +{alternativeCount - 1} more
            </button>
          )}
        </div>
        <div className="rounded-lg px-3 py-2 border border-dashed border-violet-200 dark:border-violet-800/50 bg-violet-50/50 dark:bg-violet-950/10 text-muted-foreground group-hover:text-foreground group-hover:border-violet-400/50 dark:group-hover:border-violet-600/50 text-[12px] leading-relaxed text-left transition-colors">
          {ghostOption.answer}
        </div>
      </div>
    </div>
  );
}
