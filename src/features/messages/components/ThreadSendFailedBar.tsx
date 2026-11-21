import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { MessageEvent } from '@/types';
import { SendFailedBar, type SendFailedBarProps } from './SendFailedBar';
import { failedBarState, saysUncertain, uncertainFailureText } from './deliveryState';

/**
 * The composer's "Send failed" bar, kept in step with the bubble it is about (review of #999): it
 * hides once the named reply shows as delivered (a late answer) or is gone (a colleague resent
 * it); it says "could not confirm" when that reply may have reached the customer — the api client
 * masks a 5xx's own sentence, so the reply's mark decides — and Retry then asks first, as Resend
 * does: the customer may get it twice. Told so before the thread is read again (the send's own
 * 502 answer, or the `send-failed` event), it asks first just the same.
 */
export function ThreadSendFailedBar({
  reason,
  eventId,
  thread,
  onRetry,
  retrying,
  onDismiss,
}: Omit<SendFailedBarProps, 'reason'> & {
  reason: string | null;
  /** The reply the failure named (the `send-failed` event or the send's 502 answer), when known. */
  eventId: number | null;
  thread: readonly MessageEvent[];
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  if (reason === null) return null;
  const state = failedBarState(eventId, thread);
  if (state === 'hidden') return null;
  const uncertain = state === 'uncertain' || saysUncertain(reason);
  const retry = onRetry && (uncertain ? () => setConfirmOpen(true) : onRetry);
  return (
    <>
      <SendFailedBar
        reason={uncertain && !saysUncertain(reason) ? uncertainFailureText() : reason}
        onRetry={retry}
        retrying={retrying}
        onDismiss={onDismiss}
      />
      {onRetry && uncertain && (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          onConfirm={() => {
            setConfirmOpen(false);
            onRetry();
          }}
          variant="warning"
          title="Send this reply again?"
          description="We could not confirm that this reply reached the customer. If you send it again, they may get it twice."
          confirmText="Send again"
          cancelText="Cancel"
        />
      )}
    </>
  );
}
