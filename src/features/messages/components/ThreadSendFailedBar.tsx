import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { MessageEvent } from '@/types';
import { SendFailedBar, type SendFailedBarProps } from './SendFailedBar';
import { failedBarState, ownReplyAfter, uncertainFailureText } from './deliveryState';

/**
 * The composer's "Send failed" bar, kept in step with the bubble it is about (review of #999): it
 * hides once the named reply shows as delivered (a late answer) or is gone (a colleague resent
 * it); it says "could not confirm" when that reply may have reached the customer — the api client
 * masks a 5xx's own sentence, so the reply's mark decides — and Retry then asks first, as Resend
 * does: the customer may get it twice.
 */
export function ThreadSendFailedBar({
  reason,
  eventId,
  failedAfter = null,
  ownerId,
  thread,
  onRetry,
  retrying,
  onDismiss,
}: Omit<SendFailedBarProps, 'reason'> & {
  reason: string | null;
  /** The reply the failure named (the `send-failed` event), when known. */
  eventId: number | null;
  /** A failed send no event named: the bar reads the reply it made from the thread. */
  failedAfter?: { afterId: number; authorId: number } | null;
  /** Set for a failure only the socket announced: shown only on this agent's own reply. */
  ownerId?: number | null;
  thread: readonly MessageEvent[];
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  if (reason === null) return null;
  const state = failedBarState(eventId ?? ownReplyAfter(thread, failedAfter), thread, ownerId);
  if (state === 'hidden') return null;
  const uncertain = state === 'uncertain';
  const retry = onRetry && (uncertain ? () => setConfirmOpen(true) : onRetry);
  return (
    <>
      <SendFailedBar
        reason={
          uncertain && !reason.startsWith('We could not confirm') ? uncertainFailureText() : reason
        }
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
