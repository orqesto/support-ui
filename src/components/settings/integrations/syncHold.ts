/**
 * Saying, on the row itself, that a mailbox is not actually syncing.
 *
 * A source whose connect fails is held down for 15m → 30m → 1h and skipped by every poll
 * in the meantime. Until now nothing in the UI could show that: the card renders from the
 * `message_sources` row, and the hold-down lives in redis. So a mailbox that had been down
 * all evening looked exactly like a working one, and the only place the truth existed was
 * a container log.
 *
 * Staging, 2026-08-28: `mailto:` in an IMAP username → auth rejected → an hour-long
 * hold-down → "Start all services" pressed three times, reporting success each time.
 *
 * The wording is the point of this file. "Cooling down" is what the code calls it and
 * means nothing to the person reading the card; what they need is whether to go fix a
 * password or wait for someone else's server to come back.
 */

/**
 * The shape and its defensive parsing live in the service, per the version-skew rule: the
 * field is simply absent until the backend release carrying it lands, and absent must
 * render as "nothing to say" rather than "healthy".
 */
import type { SyncHold, SyncHoldReason } from '@/services/integrations.service';

export type WithSyncHold = { syncHold?: SyncHold | null };

/** What went wrong, in the reader's terms rather than the scheduler's. */
export const HOLD_LABEL: Record<SyncHoldReason, string> = {
  auth_failed: 'Not syncing — sign-in rejected',
  unreachable: 'Not syncing — cannot reach the mail server',
  run_failures: 'Not syncing — too many errors',
  unknown: 'Not syncing',
};

/**
 * Whether this needs fixing by a human or just waiting out.
 *
 * A rejected sign-in will never fix itself, and that is the one case where the row should
 * be loud: nobody is coming to fix it unless the row says so.
 */
export const holdSeverity = (reason: SyncHoldReason): 'danger' | 'warning' =>
  reason === 'auth_failed' ? 'danger' : 'warning';

/**
 * "in 42 minutes" / "in under a minute" / "shortly".
 *
 * 🪤 A null countdown is not zero. The backend returns null when redis reported no TTL, or
 * when the hold expired between reading its reason and reading its expiry — rendering
 * that as "in 0 minutes" would be a countdown that never moves.
 */
export const formatRetry = (retryInMs?: number | null): string => {
  if (retryInMs === null || retryInMs === undefined || retryInMs <= 0) return 'shortly';

  const minutes = Math.round(retryInMs / 60_000);
  if (minutes < 1) return 'in under a minute';
  if (minutes < 60) return `in ${minutes} minute${minutes === 1 ? '' : 's'}`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hourPart = `${hours} hour${hours === 1 ? '' : 's'}`;
  return rest === 0 ? `in ${hourPart}` : `in ${hourPart} ${rest} min`;
};

/** The full sentence for a tooltip: what is wrong and when it will be tried again. */
export const describeHold = (hold: SyncHold): string =>
  `${HOLD_LABEL[hold.reason] ?? HOLD_LABEL.unknown}. Retrying ${formatRetry(hold.retryInMs)}.`;
