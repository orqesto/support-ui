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
    <div className="p-4 mb-4 bg-ai-muted rounded-lg border-2 border-ai-line">
      <div className="flex gap-2 items-center mb-3">
        <BookOpen className="w-5 h-5 text-ai" />
        <h3 className="font-display font-semibold text-ai">
          Knowledge Base References
        </h3>
        <span className="text-xs text-ai">
          {references.length} {references.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      <p className="mb-3 text-xs text-ai">
        This message was used to create the following knowledge base entries:
      </p>

      <div className="space-y-2">
        {references.map((ref) => (
          <div
            key={ref.id}
            className="p-3 bg-card rounded border border-ai-line"
          >
            <div className="flex gap-2 items-start justify-between mb-2">
              <div className="flex-1">
                <div className="flex gap-2 items-center mb-1">
                  <span className="px-2 py-0.5 text-xs font-medium text-ai bg-ai-muted rounded">
                    {getTypeLabel(ref.type)}
                  </span>
                  {ref.approved && (
                    <CheckCircle className="w-3 h-3 text-success" />
                  )}
                  {ref.topics && ref.topics.length > 0 && (
                    <span className="text-xs text-ai">
                      {ref.topics.slice(0, 2).join(', ')}
                      {ref.topics.length > 2 && '...'}
                    </span>
                  )}
                </div>
                <h4 className="font-display text-sm font-semibold text-ai">
                  {ref.title}
                </h4>
                <p className="mt-1 text-xs text-ai line-clamp-2">
                  {ref.content}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.open(`/knowledge-base?id=${ref.id}`, '_blank', 'noopener,noreferrer')}
                title="View in Knowledge Base"
                aria-label="View in Knowledge Base"
                className="flex-shrink-0"
              >
                <ExternalLink className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex gap-3 items-center text-xs text-ai">
              {ref.qualityScore && <span>Quality: {Math.round(ref.qualityScore * 100)}%</span>}
              <span>Referenced: {ref.timesReferenced}×</span>
              <span>Created: <span className="font-mono">{formatDate(ref.createdAt)}</span></span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
