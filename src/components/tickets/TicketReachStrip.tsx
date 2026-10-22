import { Card } from '@/components/ui/Card';
import type { TicketThread } from '@/services/ticketThreads.service';

const isDone = (status: string) => status === 'resolved' || status === 'closed';

const Figure = ({ value, label, warn }: { value: number; label: string; warn?: boolean }) => (
  <div className="grid gap-0.5">
    <b
      className={`font-display text-[22px] font-semibold leading-none ${warn ? 'text-pink-700 dark:text-pink-400' : ''}`}
    >
      {value}
    </b>
    <span className="text-xs text-muted-foreground">{label}</span>
  </div>
);

/**
 * How far the ticket's news has reached: how many threads it covers, how many customers have been
 * updated, how many are still owed the fix (resolved ticket) or not updated yet (open one), and
 * how many threads are resolved. Shown once there is more than one thread to count.
 */
export const TicketReachStrip = ({
  threads,
  ticketDone,
}: {
  threads: TicketThread[];
  ticketDone: boolean;
}) => {
  const total = threads.length;
  if (total < 2) return null;
  const updated = threads.filter((thread) => thread.receivedUpdate).length;
  const owed = threads.filter((thread) => thread.owesReply === true).length;
  const resolved = threads.filter((thread) => isDone(thread.status)).length;
  const share = (count: number) => `${(count / total) * 100}%`;
  return (
    <Card padding="sm" className="grid gap-2.5" aria-label="Who has heard about this ticket">
      <div className="flex flex-wrap gap-7">
        <Figure value={total} label="threads on this ticket" />
        <Figure value={updated} label="customers updated" />
        {ticketDone ? (
          <Figure value={owed} label="still owed the fix" warn={owed > 0} />
        ) : (
          <Figure value={total - updated} label="not updated yet" />
        )}
        <Figure value={resolved} label="threads resolved" />
      </div>
      {/* Two segments (updated, owed) — more than the single-value Progress component draws. */}
      <div className="flex overflow-hidden h-2 rounded bg-muted" aria-hidden="true">
        <span
          data-testid="reach-updated"
          className={ticketDone ? 'bg-success' : 'bg-primary'}
          style={{ width: share(updated) }}
        />
        <span
          data-testid="reach-owed"
          className="bg-pink-600 dark:bg-pink-400"
          style={{ width: share(owed) }}
        />
      </div>
    </Card>
  );
};
