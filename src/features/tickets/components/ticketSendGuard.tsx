/**
 * Thread presence on the ticket reply composer (spec §5.1, §5.4): the agent's "writing a reply"
 * on the ticked threads, and the confirm when the server refuses a reply because someone got
 * there first.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { isBlankRichText } from '@/lib/stripHtml';
import { replyCollisionQuestion } from '@/lib/apiError';
import type { TicketThread } from '@/features/tickets/services/ticketThreads.service';
import { ticketRepliesService } from '@/features/tickets/services/ticketReplies.service';

/**
 * When the agent last changed the box's words, for presence's "writing a reply" (null while
 * blank). Every write to the box is the agent's own: typing, an AI draft they asked for, a
 * template, undo. A draft restored from the kept copy (`restoredHtml`) is not.
 */
export const useAgentEditStamp = (draft: string, restoredHtml?: { current: string | null }) => {
  const lastAgentEditAt = useRef<number | null>(null);
  const lastWords = useRef('');
  useEffect(() => {
    const words = isBlankRichText(draft) ? '' : draft;
    if (words === '') lastAgentEditAt.current = null;
    else if (words !== lastWords.current) {
      // A kept draft coming back is not the agent writing (spec §5.1): skip its one change.
      if (restoredHtml && restoredHtml.current === draft) lastAgentEditAt.current = null;
      else lastAgentEditAt.current = Date.now();
    }
    if (restoredHtml) restoredHtml.current = null;
    lastWords.current = words;
  }, [draft]);
  return lastAgentEditAt;
};

/**
 * The newest event the agent's page knew of across the ticked threads (event ids are one global
 * serial, so one number covers them all); undefined when none is known, which leaves the reply
 * unguarded like an older client's.
 */
export const seenLastEventIdOf = (
  threads: ReadonlyArray<Pick<TicketThread, 'conversationId' | 'lastEventId'>>,
  ids: number[]
): number | undefined => {
  const ticked = new Set(ids);
  const known = threads
    .filter((row) => ticked.has(row.conversationId))
    .map((row) => row.lastEventId)
    .filter((id): id is number => typeof id === 'number');
  return known.length > 0 ? Math.max(...known) : undefined;
};

/**
 * The server said someone replied on (or is writing in) one of the threads. Its question is shown
 * verbatim; Send anyway hands the refused request back for a resend with confirmOverride, Cancel
 * (or closing the dialog) leaves the draft, files and ticks alone and calls `onCancel`.
 */
export const useSendCollision = <Request,>(onCancel: () => void) => {
  const [collision, setCollision] = useState<{ question: string; request: Request } | null>(null);
  const collisionRef = useRef(collision);
  collisionRef.current = collision;
  const take = () => {
    const pending = collisionRef.current;
    collisionRef.current = null;
    setCollision(null);
    return pending;
  };
  const offer = (question: string, request: Request) => setCollision({ question, request });
  const clear = useCallback(() => setCollision(null), []);
  const renderDialog = (onSendAnyway: (request: Request) => void) => (
    <ConfirmDialog
      open={collision !== null}
      onOpenChange={(open) => {
        if (!open && take()) onCancel();
      }}
      onConfirm={() => {
        const pending = take();
        if (pending) onSendAnyway(pending.request);
      }}
      variant="warning"
      title="Someone got here first"
      description={collision?.question ?? ''}
      confirmText="Send anyway"
      cancelText="Cancel"
    />
  );
  return { offer, clear, renderDialog };
};

type SendArgs = Parameters<typeof ticketRepliesService.send>;

/**
 * The ticket reply with the guard (spec §5.4): the newest event known on the ticked threads;
 * after a 409, the agent's "send anyway". Neither known nor asked ⇒ the call exactly as before the
 * guard existed.
 */
export const sendGuardedReply = (
  threads: ReadonlyArray<Pick<TicketThread, 'conversationId' | 'lastEventId'>>,
  ticketId: number,
  body: SendArgs[1],
  ids: number[],
  resolve: boolean | undefined,
  files: File[],
  hold: SendArgs[5],
  confirmOverride: boolean
) => {
  const seenLastEventId = seenLastEventIdOf(threads, ids);
  const guard =
    seenLastEventId === undefined && !confirmOverride
      ? undefined
      : {
          ...(seenLastEventId !== undefined && { seenLastEventId }),
          ...(confirmOverride && { confirmOverride: true }),
        };
  if (guard) {
    return ticketRepliesService.send(
      ticketId,
      body,
      ids,
      hold ? false : resolve,
      files,
      hold,
      guard
    );
  }
  return hold
    ? ticketRepliesService.send(ticketId, body, ids, false, files, hold)
    : ticketRepliesService.send(ticketId, body, ids, resolve, files);
};

/**
 * Thread presence on the ticket composer (spec §5.1, §5.4): `report` is the composer's input for
 * usePresenceReport ("writing a reply" on the ticked threads); the 409 confirm, cleared when the
 * ticket changes. `offerFromError` opens it when the error is the server's "someone got here
 * first" (true), and leaves any other error to the caller (false).
 */
export const useTicketComposerPresence = <Request,>(
  ticketId: number,
  draft: string,
  onCancel: () => void
) => {
  // Set by the unsent-draft restore so the text that comes back is not counted as writing.
  const restoredHtml = useRef<string | null>(null);
  const lastAgentEditAt = useAgentEditStamp(draft, restoredHtml);
  const report = { composerText: draft, composerMode: 'reply' as const, lastAgentEditAt };
  const { offer, clear, renderDialog } = useSendCollision<Request>(onCancel);
  // A different ticket: no question about the previous one stays.
  useEffect(() => clear(), [ticketId, clear]);
  const offerFromError = (err: unknown, request: Request) => {
    const question = replyCollisionQuestion(err);
    if (question === null) return false;
    offer(question, request);
    return true;
  };
  return { report, offerFromError, renderDialog, restoredHtml };
};
