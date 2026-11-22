import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { MessageEvent } from '@/types';
import { SendFailedBar, type SendFailedBarProps } from './SendFailedBar';
import { storedFileNames, type FilesByReply } from './ResendNotice';
import {
  STILL_SENDING,
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

/**
 * Send was pressed with a reply that is on its way already (the thread shows it as "Sending…", or
 * the server said so). Nothing failed: a plain notice, where the failure bar would be — it goes
 * when that reply is sent or not delivered, or the composer's text changes (stillSendingShown).
 */
export function StillSendingNotice({
  onDismiss,
  text = STILL_SENDING,
}: {
  onDismiss: () => void;
  /** Another plain notice in the same place ("already delivered"); default: still being sent. */
  text?: string;
}) {
  return (
    <div
      role="status"
      className="flex-shrink-0 flex items-center gap-[9px] px-3.5 py-2 bg-raised border-b border-border text-muted-foreground"
    >
      <span className="flex-1 text-[12.5px]">{text}</span>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Dismiss"
        onClick={onDismiss}
        className="w-[30px] h-[30px] rounded-[7px] text-muted-foreground hover:text-foreground hover:bg-transparent"
      >
        <X className="w-[15px] h-[15px]" />
      </Button>
    </div>
  );
}

/** Asked before a reply that may already have reached the customer goes out again. */
export function SendAgainConfirm({
  open,
  onOpenChange,
  onConfirm,
  eventId,
  attachedHere,
  attachments,
  delivered = false,
}: {
  open: boolean;
  /** The reply WAS delivered (a resend was refused): sending this text makes a second reply. */
  delivered?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  /** The reply it would replace; its stored files go again when the composer has none. */
  eventId: number | null;
  attachedHere: number;
  attachments: FilesByReply;
}) {
  const storedFiles = attachedHere > 0 ? [] : storedFileNames(attachments, eventId);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
      variant="warning"
      title="Send this reply again?"
      description={`${
        delivered
          ? 'This reply has already been delivered to the customer. If you send it again, they will get it twice.'
          : 'We could not confirm that this reply reached the customer. If you send it again, they may get it twice.'
      }${
        storedFiles.length > 0 ? ` Its attachments are sent again: ${storedFiles.join(', ')}.` : ''
      }`}
      confirmText="Send again"
      cancelText="Cancel"
    />
  );
}
