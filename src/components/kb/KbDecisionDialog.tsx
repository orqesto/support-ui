import { useEffect, useRef } from 'react';
import { KbConsolidationReview } from '@/components/kb/KbConsolidationReview';
import { KbQualityReview } from '@/components/kb/KbQualityReview';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { announceKbConsolidationDecided } from '@/lib/kbConsolidation';
import type { KbDecisionKind, KbPendingDecision } from '@/services/kb.service';

/** What reviewing each kind of decision is called (the dialog's title, a Review button's text). */
export const KB_DECISION_REVIEW_LABEL: Record<KbDecisionKind, string> = {
  merge: 'Review merge',
  attach: 'Review add to case',
  rewrite: 'Review rewrite',
  remove: 'Review removal',
  approve_capture: 'Review saved answer',
};

/** The existing review components, opened from a Knowledge Base row (one place to decide). */
export const KbDecisionDialog = ({
  decision,
  onClose,
  onDecided,
}: {
  decision: KbPendingDecision | null;
  /** `decided`: the review decided, and `onDecided` already re-read the list. */
  onClose: (decided: boolean) => void;
  onDecided: () => void;
}) => {
  // Per opening: whether the review decided, and whether this opening was closed already (the X
  // and the dialog's own close must not close — and so re-read the list — twice).
  const decidedHere = useRef(false);
  const closed = useRef(false);
  useEffect(() => {
    decidedHere.current = false;
    closed.current = false;
  }, [decision]);
  const decided = () => {
    announceKbConsolidationDecided(); // the bell recounts
    decidedHere.current = true;
    onDecided();
  };
  // Closing without a decision refreshes too: the suggestion may have been decided elsewhere
  // meanwhile (the review shows a 409 as "no longer pending" without reporting a decision).
  const close = () => {
    if (closed.current) return;
    closed.current = true;
    onClose(decidedHere.current);
  };
  return (
    <Dialog
      open={decision !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      sheetOnPhone
    >
      {decision && (
        <>
          <DialogHeader>
            <DialogTitle>{KB_DECISION_REVIEW_LABEL[decision.kind]}</DialogTitle>
            <DialogClose onClose={close} />
          </DialogHeader>
          <DialogContent>
            {decision.kind === 'merge' || decision.kind === 'attach' ? (
              <KbConsolidationReview suggestionId={decision.suggestionId} onDecided={decided} />
            ) : (
              <KbQualityReview suggestionId={decision.suggestionId} onDecided={decided} />
            )}
          </DialogContent>
        </>
      )}
    </Dialog>
  );
};
