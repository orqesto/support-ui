import { useCallback, useEffect, useState } from 'react';
import {
  KbConsolidationOutcomeNotice,
  KbConsolidationReview,
  type KbConsolidationOutcome,
} from '@/components/kb/KbConsolidationReview';
import { KbQualityReview } from '@/components/kb/KbQualityReview';

export { summarizeKbMerge } from '@/components/kb/KbConsolidationReview';
export { summarizeKbQuality } from '@/lib/kbQuality';

/**
 * The learning inbox's KB-merge pieces (#873), kept out of LearningSuggestionsSettings.
 *
 * A merge is decided in its side-by-side review. After a decision the inbox re-reads its list and
 * the decided row leaves it — so the outcome ("expired", a discarded answer) is lifted to the
 * panel and shown by `KbMergeOutcomeBanner`, instead of vanishing with the row (FE audit L4).
 */
export const KbMergeInboxReview = ({
  suggestionId,
  canAct,
  onDecided,
}: {
  suggestionId: number;
  canAct: boolean;
  onDecided: (outcome: KbConsolidationOutcome) => void;
}) => (
  <div className="px-3 pb-3 ml-5">
    {canAct && <KbConsolidationReview suggestionId={suggestionId} onDecided={onDecided} />}
  </div>
);

/**
 * A KB quality suggestion (rewrite or remove one entry) in the inbox. The list is NOT re-read on
 * a decision, so the outcome stays where it was decided; the bell re-counts on its own
 * (`announceKbConsolidationDecided`), and the row leaves the list on the next load.
 */
export const KbQualityInboxReview = ({ suggestionId, canAct }: { suggestionId: number; canAct: boolean }) => (
  <div className="px-3 pb-3 ml-5">{canAct && <KbQualityReview suggestionId={suggestionId} />}</div>
);

export const KbMergeOutcomeBanner = ({ outcome }: { outcome: KbConsolidationOutcome | null }) =>
  outcome ? (
    <div className="mb-4">
      <KbConsolidationOutcomeNotice outcome={outcome} />
    </div>
  ) : null;

/**
 * The last merge outcome, and what a decision does: remember it, then re-read the inbox quietly.
 * Cleared when the workspace changes — an outcome from another workspace is not about this list.
 */
export const useKbMergeOutcome = (reloadQuietly: () => void, workspaceKey: unknown) => {
  const [outcome, setOutcome] = useState<KbConsolidationOutcome | null>(null);
  useEffect(() => setOutcome(null), [workspaceKey]);
  const onDecided = useCallback(
    (next: KbConsolidationOutcome) => {
      setOutcome(next);
      reloadQuietly();
    },
    [reloadQuietly]
  );
  return { outcome, onDecided };
};
