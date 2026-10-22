import { Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { stripHtml } from '@/lib/stripHtml';
import { formatDate } from '@/lib/utils';
import { isInFlight, type DeliveryOutcome, type TicketReply } from '@/services/ticketReplies.service';
import type { TicketThread } from '@/services/ticketThreads.service';

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

const OUTCOME_WORDS: Record<DeliveryOutcome, string> = {
  pending: 'waiting to send',
  sending: 'sending',
  sent: 'sent',
  refused: 'not sent',
  failed: 'failed',
  interrupted: 'stopped part-way',
};

/** Sent from reviewed drafts: the text shown is the base each thread's own version came from. */
export const hasReviewedVersions = (reply: TicketReply) =>
  reply.deliveries.some((row) => row.hasOwnText);

/** The threads a reply reached. */
export const sentTo = (reply: TicketReply) =>
  new Set(
    reply.deliveries.filter((row) => row.outcome === 'sent').map((row) => row.conversationId)
  );

/**
 * "Sent from this ticket": each update sent, how far it reached, what failed, and the ways to send
 * it on to the threads that have not had it (R6) — moved out of TicketReplyComposer as it was.
 */
export const TicketSentHistory = ({
  replies,
  threads,
  emailOf,
  unreachable,
  maxThreads,
  sending,
  busy,
  onAskAgain,
  onAskHere,
}: {
  replies: TicketReply[];
  threads: TicketThread[];
  emailOf: Map<number, string>;
  unreachable: Map<number, string>;
  maxThreads: number;
  sending: boolean;
  busy: boolean;
  onAskAgain: (reply: TicketReply, ids: number[]) => void;
  onAskHere: (reply: TicketReply, id: number) => void;
}) => (
  <>
      {replies.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Sent from this ticket</h4>
          <ul className="space-y-2">
            {replies.map((reply) => {
              const had = sentTo(reply);
              const reached = threads.filter((row) => had.has(row.conversationId)).length;
              const live = new Set(
                reply.deliveries
                  .filter((row) => isInFlight(row.outcome))
                  .map((row) => row.conversationId)
              );
              /*
                R6: the threads that should have it and do not — a delivery that failed, was
                refused or stopped part-way, and a thread linked to the ticket AFTER this reply.
                ⛔ Never a thread the agent left unticked on purpose (it has no delivery row and
                was already on the ticket).
              */
              const tried = new Set(reply.deliveries.map((row) => row.conversationId));
              const missing = threads
                .filter(
                  (row) =>
                    tried.has(row.conversationId) ||
                    new Date(row.addedAt).getTime() > new Date(reply.createdAt).getTime()
                )
                .map((row) => row.conversationId)
                .filter((id) => !had.has(id) && !live.has(id) && !unreachable.has(id));
              // "Send here": every other thread it has not reached that it can reach — one at a time.
              const offered = new Set(missing);
              const here =
                reply.content === null
                  ? []
                  : threads
                      .map((row) => row.conversationId)
                      .filter(
                        (id) =>
                          !had.has(id) && !live.has(id) && !unreachable.has(id) && !offered.has(id)
                      );
              const problems = reply.deliveries.filter(
                (row) =>
                  row.outcome === 'failed' ||
                  row.outcome === 'refused' ||
                  row.outcome === 'interrupted'
              );
              return (
                <li key={reply.id} className="p-3 rounded-lg border border-border space-y-1">
                  {reply.content === null ? (
                    <p className="text-sm text-muted-foreground">
                      Sent only to threads in teams you cannot open.
                    </p>
                  ) : (
                    <p className="text-sm line-clamp-2">{stripHtml(reply.content)}</p>
                  )}
                  {reply.content !== null && hasReviewedVersions(reply) && (
                    <p className="text-xs text-muted-foreground">
                      Each customer received their own reviewed version.
                    </p>
                  )}
                  {reply.attachments.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      <Paperclip className="inline w-3 h-3 mr-1 -mt-0.5" aria-hidden />
                      {reply.attachments.map((file) => file.filename).join(', ')}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {reply.createdBy?.name ?? 'Someone'} · {formatDate(reply.createdAt)} · sent to{' '}
                    {reached} of {threads.length}
                    {live.size > 0 && ` · sending to ${live.size}…`}
                    {reply.hiddenCount > 0 &&
                      ` · ${reply.hiddenCount} more in teams you cannot open`}
                  </p>
                  {problems.map((row) => (
                    <p key={row.conversationId} className="text-xs text-destructive">
                      {emailOf.get(row.conversationId) ?? `Thread #${row.conversationId}`}:{' '}
                      {OUTCOME_WORDS[row.outcome]}
                      {row.reason && ` — ${row.reason}`}
                    </p>
                  ))}
                  {/* A reply the agent cannot read is not theirs to send on (G1). */}
                  {reply.content !== null && missing.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onAskAgain(reply, missing)}
                      disabled={sending || missing.length > maxThreads}
                    >
                      Send to the {missing.length}{' '}
                      {plural(missing.length, 'thread that has', 'threads that have')} not had it
                    </Button>
                  )}
                  {here.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-xs text-muted-foreground">Not sent to:</span>
                      {here.map((id) => (
                        <Button
                          key={id}
                          size="sm"
                          variant="ghost"
                          onClick={() => onAskHere(reply, id)}
                          disabled={busy}
                          aria-label={`Send this reply to ${emailOf.get(id) ?? `thread #${id}`}`}
                          className="h-auto px-1.5 py-0.5 text-xs"
                        >
                          {emailOf.get(id) ?? `Thread #${id}`} · Send here
                        </Button>
                      ))}
                    </div>
                  )}
                  {missing.length > maxThreads && (
                    <p className="text-xs text-muted-foreground">
                      More than {maxThreads} threads have not had it — one send reaches at
                      most {maxThreads}; tick them in the list above and send it again.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
  </>
);
