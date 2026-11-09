/**
 * Thread presence on the ticket reply composer (spec §5.1, §5.4): the agent's "writing a reply"
 * on the ticked threads, and the confirm when the server refuses a reply because someone got
 * there first.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { isBlankRichText } from '@/lib/stripHtml';
import type { TicketThread } from '@/features/tickets/services/ticketThreads.service';

/**
 * When the agent last changed the box's words, for presence's "writing a reply" (null while
 * blank). Every write to the box is the agent's own: typing, an AI draft they asked for, a
 * template, undo.
 */
export const useAgentEditStamp = (draft: string) => {
  const lastAgentEditAt = useRef<number | null>(null);
  const lastWords = useRef('');
  useEffect(() => {
    const words = isBlankRichText(draft) ? '' : draft;
    if (words === '') lastAgentEditAt.current = null;
    else if (words !== lastWords.current) lastAgentEditAt.current = Date.now();
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
