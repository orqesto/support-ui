import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';

/**
 * The backend did not keep the KB answer as the thread's suggestion: the email it was found for is
 * no longer the one a draft answers (the customer wrote again, a merge moved emails, a verdict
 * changed — round 18: the text names no single cause). Nothing goes into the reply without the
 * agent's second click (owner 2026-11-17, review round 16).
 */
export const StaleAnswerConfirm = ({
  onInsert,
  onCancel,
}: {
  onInsert: () => void;
  onCancel: () => void;
}) => (
  <Alert variant="warning" className="mt-4">
    <p>
      This answer was found for an earlier email — the customer&apos;s latest email is now a
      different one.
    </p>
    <div className="mt-3 flex gap-2">
      <Button size="sm" onClick={onInsert}>
        Insert anyway
      </Button>
      <Button size="sm" variant="outline" onClick={onCancel}>
        Don&apos;t insert
      </Button>
    </div>
  </Alert>
);
