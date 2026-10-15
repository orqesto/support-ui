import { useState } from 'react';
import { ChevronDown, ChevronRight, Eye } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { learningService, type SuggestionEvidenceItem } from '@/services/learning.service';
import { logger } from '@/lib/logger';
import { getApiErrorMessage } from '@/lib/errorMessages';

// Evidence section — lazy-fetched on first expand. Shows the actual messages
// behind the conflict with per-rule match badges and a deep-link to the
// conversation, so admins can judge whether the conflict is real on
// user-visible traffic before clicking Accept/Decline.
export const EvidenceSection = ({ suggestionId }: { suggestionId: number }) => {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<SuggestionEvidenceItem[] | null>(null);
  // Track the BE's scannedCount alongside items so the empty-state copy can
  // distinguish "no traffic yet" (scannedCount === 0) from "scanned N, none
  // co-matched" (scannedCount > 0 — often a false-positive conflict).
  const [scannedCount, setScannedCount] = useState<number | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    // Lazy-load: only fetch on first expand. Subsequent toggles use cache.
    if (next && items === null && !loading) {
      setLoading(true);
      setError(null);
      try {
        const response = await learningService.getSuggestionEvidence(suggestionId);
        setItems(response.evidence);
        setScannedCount(response.scannedCount);
      } catch (err) {
        logger.error('Failed to load suggestion evidence:', err);
        setError(getApiErrorMessage(err) ?? 'Failed to load evidence');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="mt-2 pt-2 border-t border-border/40">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => void toggle()}
        className="gap-1 items-center p-0 h-auto text-xs text-muted-foreground hover:text-foreground hover:bg-transparent"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <Eye className="w-3 h-3" />
        Evidence messages
      </Button>
      {open && (
        <div className="mt-2">
          {loading && <p className="text-xs text-muted-foreground">Loading…</p>}
          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
          {!loading && !error && items !== null && items.length === 0 && (
            <p className="text-xs text-muted-foreground italic">
              {scannedCount === 0
                ? 'No messages in the last 30 days yet. Evidence will appear as traffic arrives.'
                : typeof scannedCount === 'number' && scannedCount > 0
                  ? `Scanned ${scannedCount.toLocaleString()} recent messages; none matched both rules. This conflict may be a false positive — consider declining if you don't expect these rules to ever co-fire.`
                  : 'No evidence messages available for this suggestion.'}
            </p>
          )}
          {!loading && !error && items !== null && items.length > 0 && (
            <ul className="space-y-2">
              {items.map((item) => (
                <li
                  key={item.messageId}
                  className="rounded-md border border-border/60 bg-background/40 p-2"
                >
                  <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    <Link
                      to={`/messages/${item.conversationId}`}
                      className="text-xs font-medium text-primary hover:underline truncate max-w-[280px]"
                      title={item.subject ?? '(no subject)'}
                    >
                      {item.subject && item.subject.length > 0
                        ? item.subject
                        : '(no subject)'}
                    </Link>
                    {item.ruleAMatched && (
                      <span className="inline-flex items-center h-4 px-1 rounded text-[10px] font-semibold bg-warning/15 text-warning">
                        A
                      </span>
                    )}
                    {item.ruleBMatched && (
                      <span className="inline-flex items-center h-4 px-1 rounded text-[10px] font-semibold bg-ai-muted text-ai">
                        B
                      </span>
                    )}
                    {item.ruleAMatched && item.ruleBMatched && (
                      <span
                        className="inline-flex items-center h-4 px-1 rounded text-[10px] font-semibold bg-destructive/15 text-destructive"
                        title="This message matches both rules — the conflict is real here"
                      >
                        Overlap
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {item.contentExcerpt}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
