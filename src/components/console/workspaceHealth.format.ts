/**
 * Console › System › By workspace — the words and the order.
 *
 * ⛔ Parity: a mailbox's state is worded exactly as the workspace admin already sees it —
 * `HOLD_LABEL` from the Settings › Integrations badge, and the bell's section titles ("Mailbox not
 * being polled", "Mail may be missing"). The console must not rename what the app said.
 *
 * ⛔ Nothing here claims "healthy". The backend knows of a hold, a standing alert and the last
 * completed check — not every failure (an IMAP connect error below the hold threshold is recorded
 * nowhere). A mailbox with none of those reads "No problem reported", which is what is true.
 */
import { formatDuration } from '@/components/console/failureAnalysis.format';
import { HOLD_LABEL, formatRetry, holdSeverity } from '@/components/settings/integrations/syncHold';
import { normalizeSyncHold } from '@/services/integrations.service';
import type {
  WorkspaceHealthReport,
  WorkspaceHealthRow,
  WorkspaceMailbox,
} from '@/services/platform.service';

export type Tone = 'danger' | 'warning' | 'muted' | 'default';

export type MailboxState = {
  tone: Tone;
  label: string;
  /** Second line: when it started / when it retries / when it was last checked. */
  detail: string | null;
  /** Error samples the backend kept for a "too many errors" hold. */
  errors: Array<{ message: string; count: number }>;
  problem: boolean;
};

const ago = (iso: string | number | null, now: number): string | null => {
  if (iso === null) return null;
  const at = typeof iso === 'number' ? iso : Date.parse(iso);
  if (!Number.isFinite(at)) return null;
  return `${formatDuration(Math.max(0, now - at))} ago`;
};

export const mailboxState = (mailbox: WorkspaceMailbox, now: number = Date.now()): MailboxState => {
  const checked = ago(mailbox.lastCheckAt, now);
  const lastCheck = checked ? `last completed check ${checked}` : 'never completed a check';
  const hold = normalizeSyncHold(mailbox.hold);

  if (!mailbox.enabled) {
    return { tone: 'muted', label: 'Disabled', detail: lastCheck, errors: [], problem: false };
  }
  if (hold) {
    const since = ago(hold.since, now);
    return {
      tone: holdSeverity(hold.reason),
      label: HOLD_LABEL[hold.reason],
      detail: [
        since ? `since ${since}` : null,
        `retrying ${formatRetry(hold.retryInMs)}`,
        lastCheck,
      ]
        .filter(Boolean)
        .join(' · '),
      errors: mailbox.hold?.errors ?? [],
      problem: true,
    };
  }
  if (mailbox.openAlerts.dark > 0) {
    return {
      tone: 'warning',
      label: 'Mailbox not being polled',
      detail: lastCheck,
      errors: [],
      problem: true,
    };
  }
  if (mailbox.openAlerts.gap > 0) {
    const count = mailbox.openAlerts.gap;
    return {
      tone: 'warning',
      label: 'Mail may be missing',
      detail: `${count} open alert${count === 1 ? '' : 's'} · ${lastCheck}`,
      errors: [],
      problem: true,
    };
  }
  return {
    tone: 'default',
    label: 'No problem reported',
    detail: lastCheck,
    errors: [],
    problem: false,
  };
};

/** How many things on this row need a look: an unreadable workspace, mailbox problems, failed jobs. */
export const workspaceProblems = (row: WorkspaceHealthRow, now: number = Date.now()): number =>
  (row.mailboxError ? 1 : 0) +
  row.mailboxes.filter((mailbox) => mailboxState(mailbox, now).problem).length +
  (row.jobs.failed > 0 ? 1 : 0);

const totalJobs = (row: WorkspaceHealthRow): number =>
  row.jobs.queued + row.jobs.active + row.jobs.delayed + row.jobs.failed;

/** Rows with problems first, then the busiest, then by name. */
export const sortWorkspaces = (
  rows: WorkspaceHealthRow[],
  now: number = Date.now()
): WorkspaceHealthRow[] =>
  [...rows].sort(
    (left, right) =>
      workspaceProblems(right, now) - workspaceProblems(left, now) ||
      totalJobs(right) - totalJobs(left) ||
      left.name.localeCompare(right.name)
  );

/** "12 min" for the oldest job still waiting to start, or "—". */
export const oldestWaiting = (row: WorkspaceHealthRow, now: number = Date.now()): string =>
  row.jobs.oldestQueuedAt === null
    ? '—'
    : formatDuration(Math.max(0, now - row.jobs.oldestQueuedAt));

/**
 * ⛔ A bound must say it bit. When a (queue, state) held more jobs than were read, every count on
 * the page is a floor and the caption says which and by how much. The oldest-waiting age too: the
 * backend reads waiting jobs oldest first, but PRIORITIZED ones in priority order, so under the cap
 * the oldest of those may not have been read (checked on real BullMQ 2026-09-24).
 */
export const truncationNote = (report: WorkspaceHealthReport): string | null => {
  if (report.truncated.length === 0) return null;
  const parts = report.truncated.map(
    (cut) => `${cut.queue} ${cut.state}: first ${cut.read} of ${cut.total}`
  );
  return `Only part of these jobs was read, so the counts are a lower bound and the oldest waiting age may be too young: ${parts.join('; ')}.`;
};

/** The queues a workspace has any job in, busiest first. */
export const queueBreakdown = (row: WorkspaceHealthRow) =>
  Object.entries(row.jobs.byQueue)
    .map(([name, counts]) => ({
      name,
      ...counts,
      total: counts.queued + counts.active + counts.delayed + counts.failed,
    }))
    .filter((queue) => queue.total > 0)
    .sort((left, right) => right.total - left.total || left.name.localeCompare(right.name));
