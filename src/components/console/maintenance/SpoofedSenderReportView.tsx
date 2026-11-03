import type { RepairResult } from '@/services/maintenance.service';

/**
 * Result of the read-only "Senders with an address hidden in the name" Check (BE
 * `POST /api/system/spoofed-sender-report`), in plain words — no backend keys.
 */
type SpoofedSenderSample = {
  eventId: number;
  conversationId: number;
  column: 'author_email' | 'requester_email';
  naive: string;
  actual: string;
};

type SpoofedSenderResult = {
  rowsRead?: number;
  authorEmails?: number;
  requesterEmails?: number;
  samples?: SpoofedSenderSample[];
  moreRemaining?: boolean;
};

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`;

export const SpoofedSenderReportView = ({
  title,
  result,
}: {
  title: string;
  result: RepairResult;
}) => {
  const data = result as SpoofedSenderResult;
  const senders = data.authorEmails ?? 0;
  const requesters = data.requesterEmails ?? 0;
  const total = senders + requesters;
  const samples = Array.isArray(data.samples) ? data.samples : [];
  return (
    <div className="p-3 mt-2 space-y-1 text-sm rounded-md bg-muted/40">
      <p className="mb-1 font-medium text-foreground">{title}</p>
      <p>Checked {plural(data.rowsRead ?? 0, 'message')}.</p>
      {total === 0 ? (
        <p>No stored sender is read wrongly.</p>
      ) : (
        <p>
          {plural(senders, 'message sender')} and {plural(requesters, 'thread requester')}{' '}
          {total === 1 ? 'is' : 'are'} read wrongly.
        </p>
      )}
      {samples.length > 0 && (
        <ul className="space-y-0.5" data-testid="spoofed-sender-samples">
          {samples.map((sample) => (
            <li key={`${sample.column}-${sample.eventId}`}>
              {`Message ${sample.eventId} (thread ${sample.conversationId}): read as ${sample.naive}, really ${sample.actual}`}
            </li>
          ))}
        </ul>
      )}
      {data.moreRemaining === true && <p>More remains: check the next batch.</p>}
    </div>
  );
};
