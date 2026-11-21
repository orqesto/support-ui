import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { MessageEvent } from '@/types';
import { SendFailedBar, type SendFailedBarProps } from './SendFailedBar';
import {
  failedBarState,
  ownReplyAfter,
  saysUncertain,
  uncertainFailureText,
} from './deliveryState';

/**
 * The composer's "Send failed" bar, kept in step with the bubble it is about (review of #999): it
 * hides once the named reply shows as delivered (a late answer) or is gone (a colleague resent
 * it), and says "could not confirm" when that reply may have reached the customer — the api client
 * masks a 5xx's own sentence, so the reply's mark decides. Retry asks nothing here: the send
 * itself asks first when it would send that reply AGAIN (useReplySend), and not when the agent
 * has written another one meanwhile.
 */
export function ThreadSendFailedBar({
  reason,
  eventId,
  failedAfter = null,
  ownOnly = false,
  ownerId,
  thread,
  onRetry,
  retrying,
  onDismiss,
}: Omit<SendFailedBarProps, 'reason'> & {
  reason: string | null;
  /** The reply the failure named (the `send-failed` event or the send's 502 answer), when known. */
  eventId: number | null;
  /** A failed send no event named: the bar reads the reply it made from the thread. */
  failedAfter?: { afterId: number; authorId: number } | null;
  /** A failure only the socket announced: shown only once the named reply is read and is `ownerId`'s. */
  ownOnly?: boolean;
  /** The signed-in agent. */
  ownerId?: number | null;
  thread: readonly MessageEvent[];
}) {
  if (reason === null) return null;
  // An event may have named a COLLEAGUE's reply while this tab's own request was failing (the
  // event goes to the whole workspace): once read as someone else's, it is not this bar's reply.
  const named = eventId === null ? undefined : thread.find((event) => event.id === eventId);
  const foreign =
    !ownOnly &&
    typeof ownerId === 'number' &&
    typeof named?.authorId === 'number' &&
    named.authorId !== ownerId;
  const state = failedBarState(
    (foreign ? null : eventId) ?? ownReplyAfter(thread, failedAfter),
    thread,
    ownOnly ? ownerId : undefined
  );
  if (state === 'hidden') return null;
  const uncertain = state === 'uncertain' || saysUncertain(reason);
  return (
    <SendFailedBar
      reason={uncertain && !saysUncertain(reason) ? uncertainFailureText() : reason}
      onRetry={onRetry}
      retrying={retrying}
      onDismiss={onDismiss}
    />
  );
}

/** Asked before a reply that may already have reached the customer goes out again. */
export function SendAgainConfirm({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
      variant="warning"
      title="Send this reply again?"
      description="We could not confirm that this reply reached the customer. If you send it again, they may get it twice."
      confirmText="Send again"
      cancelText="Cancel"
    />
  );
}
