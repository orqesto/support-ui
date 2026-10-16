import { Button } from '@/components/ui/Button';
import type { KBEntry, KbPendingDecision } from '@/services/kb.service';
import { reviewableDecision } from './kbWorkRowModel';

/** A row's Review button: shown only for a suggestion the viewer may decide, and opens that one. */
export const KbReviewDecisionButton = ({
  entry,
  onReview,
  className,
}: {
  entry: KBEntry;
  onReview?: (decision: KbPendingDecision) => void;
  className?: string;
}) => {
  const decision = reviewableDecision(entry);
  if (!onReview || !decision) return null;
  return (
    <Button size="sm" variant="outline" onClick={() => onReview(decision)} className={className}>
      Review
    </Button>
  );
};
