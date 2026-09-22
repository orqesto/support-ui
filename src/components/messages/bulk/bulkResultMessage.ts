/**
 * What the agent is told after a run.
 *
 * ⛔ A count of successes is not a report. A run can apply 12, refuse 2 and FAIL 1, and the one
 * that failed is the only part that needs a person — so it is named first when it happens, and
 * never folded into "12 threads updated".
 */
import {
  ACTION_LABEL,
  ACTION_PHRASE,
  groupRefusals,
  type BulkAction,
  type BulkResult,
} from './bulkActions';

export type BulkOutcome = { tone: 'success' | 'warning'; text: string };

const threads = (count: number): string => `${count} ${count === 1 ? 'thread' : 'threads'}`;

export const describeResult = (action: BulkAction, result: BulkResult): BulkOutcome => {
  const parts: string[] = [];
  const applied = result.applied.length;

  parts.push(
    applied === 0
      ? `Nothing to ${ACTION_PHRASE[action]}`
      : `${ACTION_LABEL[action]}: ${threads(applied)}`
  );

  // The queued half of "Resolve & save to KB": the threads are resolved NOW, the entries appear
  // once extraction finishes. Saying "saved" here would be a promise the run has not kept yet.
  if (result.kbJobsQueued !== undefined && result.kbJobsQueued > 0) {
    parts.push(`knowledge-base capture running for ${threads(result.kbJobsQueued)}`);
  }

  if (result.ticketId !== undefined) parts.push(`ticket #${result.ticketId} created`);

  if (result.refused.length > 0) {
    const [biggest, ...rest] = groupRefusals(result.refused);
    const others = rest.reduce((sum, entry) => sum + entry.count, 0);
    parts.push(
      others > 0
        ? `${biggest.count} skipped (${biggest.text}) and ${others} for other reasons`
        : `${biggest.count} skipped (${biggest.text})`
    );
  }

  if (result.failed.length > 0) {
    parts.push(`${threads(result.failed.length)} FAILED — try them individually`);
  }

  return {
    tone: result.failed.length > 0 ? 'warning' : 'success',
    text: `${parts.join(' · ')}.`,
  };
};
