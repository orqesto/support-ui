/**
 * Decide what a freshly-received realtime `sla_breach` event means relative to
 * what we've already surfaced for that notification id.
 *
 * The BE deliberately re-delivers a warning→critical escalation reusing the
 * SAME notifications.id (severity-qualified BullMQ jobId, dismissedAt cleared).
 * Deduping on id alone dropped it — the bell stayed "warning" and unreadCount
 * never bumped. This classifies the three cases so the hook can surface an
 * escalation as an in-place update instead of a silent drop.
 */

export type BreachSeverity = 'warning' | 'critical';

export type BreachDisposition =
  | 'new' // never seen this id — surface it
  | 'escalation' // seen at a lower severity — re-surface as an update
  | 'duplicate'; // seen at the same/higher severity — ignore

export const classifyBreach = (
  prevSeverity: BreachSeverity | undefined,
  incomingSeverity: BreachSeverity
): BreachDisposition => {
  if (prevSeverity === undefined) return 'new';
  // Only warning → critical is an escalation. critical → warning (de-escalation)
  // and same-severity re-broadcasts are treated as duplicates.
  if (prevSeverity === 'warning' && incomingSeverity === 'critical') return 'escalation';
  return 'duplicate';
};
