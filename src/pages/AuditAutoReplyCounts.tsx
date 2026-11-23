import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { auditLogService, type AutoReplyCounts } from '@/services/auditLog.service';
import { AUTO_REPLY_CHANNEL_LABEL, anyAutoReplyReasonLabel } from '@/features/messages/shell';
import { getApiErrorMessage, getErrorStatus } from '@/lib/errorMessages';
import { logger } from '@/lib/logger';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; counts: AutoReplyCounts }
  /** The backend refused the range (over 92 days) or failed: its sentence. */
  | { kind: 'failed'; message: string }
  /** A backend without the counts (404): nothing is shown. */
  | { kind: 'absent' };

/** Holds by reason, in words: codes with the same words — or none — are counted together. */
const reasonRows = (rows: AutoReplyCounts['heldByReason']): Array<[string, number]> => {
  const byWords = new Map<string, number>();
  for (const row of rows) {
    const words = anyAutoReplyReasonLabel(row.reason);
    byWords.set(words, (byWords.get(words) ?? 0) + row.count);
  }
  return [...byWords.entries()].sort((left, right) => right[1] - left[1]);
};

const Figure = ({ label, value, hint }: { label: string; value: number; hint: string }) => (
  <div className="min-w-[8rem]" title={hint}>
    <p className="font-display text-2xl font-bold tabular-nums">{value}</p>
    <p className="text-xs text-muted-foreground">{label}</p>
  </div>
);

/**
 * What the automatic replies did in the period, above their audit rows: how many were sent, how
 * many WOULD have been sent (check-only mode), how many were held and why, per channel. The period
 * is the page's date filter, or the last 7 days without one.
 */
export function AuditAutoReplyCounts({
  startDate,
  endDate,
  refreshKey,
  onAbsent,
}: {
  startDate?: string;
  endDate?: string;
  /** Changes when the page is refreshed. */
  refreshKey: number;
  /** The backend has no counts — and so none of the filters that came with them. */
  onAbsent?: () => void;
}) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  useEffect(() => {
    let stale = false;
    setState({ kind: 'loading' });
    auditLogService
      .getAutoReplyCounts(startDate && endDate ? { startDate, endDate } : undefined)
      .then(
        (counts) => {
          if (!stale) setState({ kind: 'ready', counts });
        },
        (error: unknown) => {
          if (stale) return;
          if (getErrorStatus(error) === 404) {
            setState({ kind: 'absent' });
            onAbsent?.();
            return;
          }
          logger.error('Automatic reply counts could not be read', error);
          setState({
            kind: 'failed',
            message: getApiErrorMessage(error) ?? 'The counts could not be read.',
          });
        }
      );
    return () => {
      stale = true;
    };
    // `onAbsent` is the page's inline callback; the read depends on the period alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [startDate, endDate, refreshKey]);

  if (state.kind === 'absent') return null;
  const period = startDate && endDate ? `${startDate} – ${endDate}` : 'Last 7 days';
  return (
    <Card>
      <CardContent className="p-4 space-y-3" data-testid="auto-reply-counts">
        <div className="flex flex-wrap gap-2 justify-between items-baseline">
          <h2 className="font-display text-sm font-semibold">Automatic replies</h2>
          <span className="text-xs text-muted-foreground">{period}</span>
        </div>
        {state.kind === 'loading' && (
          <p role="status" className="text-sm text-muted-foreground">
            Counting…
          </p>
        )}
        {state.kind === 'failed' && (
          <p role="alert" className="text-sm text-destructive">
            {state.message}
          </p>
        )}
        {state.kind === 'ready' && (
          <>
            <div className="flex flex-wrap gap-6">
              <Figure
                label="Sent"
                value={state.counts.totals.sent}
                hint="Replies emailed or posted with no person behind them"
              />
              <Figure
                label="Would have been sent"
                value={state.counts.totals.wouldSend}
                hint="Check-only mode: passed every check, kept as a draft, not sent"
              />
              <Figure
                label="Held for a person"
                value={state.counts.totals.held}
                hint="Not sent, or not confirmed sent"
              />
              <Figure
                label="Receipt confirmations"
                value={state.counts.totals.acknowledgments}
                hint="A mailbox's fixed “we got your message” — counted apart from Sent"
              />
            </div>
            {state.counts.byChannel.length > 0 && (
              <ul aria-label="Automatic replies by channel" className="text-xs space-y-0.5">
                {state.counts.byChannel.map((row) => (
                  <li key={row.channel}>
                    <span className="font-medium">
                      {AUTO_REPLY_CHANNEL_LABEL[row.channel] ?? 'Other channel'}
                    </span>
                    : {row.sent} sent · {row.wouldSend} would have been sent · {row.held} held
                    {row.acknowledgments > 0
                      ? ` · ${row.acknowledgments} receipt confirmations`
                      : ''}
                  </li>
                ))}
              </ul>
            )}
            {state.counts.heldByReason.length > 0 && (
              <div className="text-xs">
                <p className="font-medium">Why replies were held</p>
                <ul aria-label="Held replies by reason" className="space-y-0.5">
                  {reasonRows(state.counts.heldByReason).map(([words, count]) => (
                    <li key={words}>
                      {count} — {words}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
