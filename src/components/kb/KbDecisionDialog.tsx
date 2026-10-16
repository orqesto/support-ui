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

const TITLE: Record<KbDecisionKind, string> = {
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
  onClose: () => void;
  onDecided: () => void;
}) => {
  const decided = () => {
    announceKbConsolidationDecided(); // the bell recounts
    onDecided();
  };
  // Closing refreshes too: the suggestion may have been decided elsewhere meanwhile.
  const close = () => {
    onClose();
    onDecided();
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
            <DialogTitle>{TITLE[decision.kind]}</DialogTitle>
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
