import { useEffect, useState } from 'react';
import { BookOpen, CheckCircle, ExternalLink } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { formatDate } from '@/lib/utils';
import { messageService } from '@/services/message.service';
import { logger } from '@/lib/logger';
import { getApiErrorMessage } from '@/lib/errorMessages';

type KBReference = {
  id: number;
  type: 'qa_pair' | 'document' | 'manual_entry';
  title: string;
  content: string;
  qualityScore: number | null;
  approved: boolean;
  timesReferenced: number;
  lastReferencedAt: string | null;
  topics: string[] | null;
  category: string | null;
  typeData: unknown;
  createdAt: string;
};

type MessageKBReferencesProps = {
  messageId: number;
  /** Reports how many references this message has once loaded (0 on error), for the tab badge. */
  onCountChange?: (messageId: number, count: number) => void;
};

export const MessageKBReferences = ({ messageId, onCountChange }: MessageKBReferencesProps) => {
  const [references, setReferences] = useState<KBReference[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    /*
      ⛔ NOTHING IS SET AFTER THIS COMPONENT IS GONE. The fetch outlives a thread the agent closed,
      or a `messageId` that changed while it was in flight, and every write below then lands on a
      component that no longer exists — a stale count for the tab badge at best.

      🪤 It also fails CI at random: a test file finishes, vitest tears the jsdom environment down,
      the pending response resolves, and React's `dispatchSetState` reaches for `window` and throws
      an unhandled rejection. Reproduced on untouched `staging` (2320 tests pass, 1 error), so this
      is not new — it is a race that only sometimes lands inside the run.
    */
    let live = true;
    const fetchReferences = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await messageService.getKBReferences(messageId);
        const loaded = response.success && response.data ? response.data : [];
        if (!live) return;
        setReferences(loaded);
        onCountChange?.(messageId, loaded.length);
      } catch (err) {
        logger.error('Failed to load KB references:', err);
        if (!live) return;
        onCountChange?.(messageId, 0);
        setError(getApiErrorMessage(err) ?? 'Failed to load KB references');
      } finally {
        if (live) setLoading(false);
      }
    };

    void fetchReferences();
    return () => {
      live = false;
    };
    // `onCountChange` is left out on purpose: a new callback identity must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageId]);

  if (loading) {
    return (
      <div className="flex items-center px-1 py-1">
        <Spinner />
      </div>
    );
  }

  if (error !== null || references.length === 0) {
    return null; // No references or error - don't display anything
  }

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'qa_pair':
        return 'Q&A';
      case 'document':
        return 'Document';
      case 'manual_entry':
        return 'Manual Entry';
      default:
        return type;
    }
  };

  return (
    // v4 KB tab: a heading and compact `.filerow` rows, in place of the big violet card. Same data.
    <section className="pt-2" aria-labelledby={`kb-refs-${messageId}`}>
      <h4
        id={`kb-refs-${messageId}`}
        className="mb-1 font-display text-[10px] font-semibold uppercase tracking-[0.1em] text-faint-foreground"
      >
        {/* ⛔ What the endpoint returns is entries CREATED FROM this message (kb-references), not
            articles quoted to the customer — the heading says exactly that. */}
        Saved to the knowledge base from this thread
      </h4>
      <ul>
        {references.map((ref) => (
          <li
            key={ref.id}
            className="flex items-center gap-2.5 mb-1.5 py-2 pl-2.5 pr-2 rounded-lg border border-border bg-card"
          >
            <span className="grid place-items-center w-7 h-7 rounded-[7px] bg-sunken text-muted-foreground flex-shrink-0">
              <BookOpen className="w-3.5 h-3.5" aria-hidden />
            </span>
            <span className="flex flex-col flex-1 min-w-0 leading-[1.3]">
              <b className="flex items-center gap-1 text-[12.5px] font-medium text-foreground">
                <span className="truncate">{ref.title}</span>
                {ref.approved && (
                  <CheckCircle
                    className="w-3 h-3 text-success flex-shrink-0"
                    aria-label="Approved"
                  />
                )}
              </b>
              <span className="text-[11px] text-muted-foreground truncate">
                {[
                  getTypeLabel(ref.type),
                  ref.topics && ref.topics.length > 0
                    ? `${ref.topics.slice(0, 2).join(', ')}${ref.topics.length > 2 ? '...' : ''}`
                    : null,
                  ref.qualityScore ? `Quality: ${Math.round(ref.qualityScore * 100)}%` : null,
                  // timesReferenced is workspace-wide: bumped each time the AI cites the entry in
                  // a suggested or automatic answer, on ANY thread (BE trackKBUsage).
                  ref.timesReferenced > 0
                    ? `AI used it ${ref.timesReferenced}× (all threads)`
                    : null,
                  `Created: ${formatDate(ref.createdAt)}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              {ref.content && (
                <span className="text-[11px] text-faint-foreground line-clamp-1">
                  {ref.content}
                </span>
              )}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() =>
                window.open(`/knowledge-base?id=${ref.id}`, '_blank', 'noopener,noreferrer')
              }
              title="View in Knowledge Base"
              aria-label="View in Knowledge Base"
              className="w-[30px] h-[30px] flex-shrink-0 rounded-[7px] border border-border text-muted-foreground"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
};
