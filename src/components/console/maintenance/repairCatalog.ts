/**
 * The one-off repairs Console → Maintenance can run (backend `/api/system/*`, each global-admin
 * only, dry run unless `apply` is exactly `true`, audit-logged on apply).
 *
 * - `workspace`: runs in ONE workspace, picked on the page and sent as the request's own
 *   `X-Organization-Context`.
 * - `platform`: walks every workspace; the dry run returns the `organizationIds` it found, and
 *   the apply must name them (the backend answers 409 without them).
 * - `checkOnly`: a read-only report — no Apply.
 * Repairs with a screen of their own are listed with a pointer instead (`elsewhere`).
 */

export type RepairScope = 'workspace' | 'platform';

export interface RepairEntry {
  id: string;
  label: string;
  does: string;
  /** The route under `/api/system/`. */
  path: string;
  scope: RepairScope;
  method?: 'post' | 'get';
  checkOnly?: boolean;
  /** A warning shown before Apply. */
  caution?: string;
  /** Long scans stop at a limit; the next run continues from the result's `nextAfterEventId`. */
  pagedByEventId?: boolean;
}

export const REPAIRS: RepairEntry[] = [
  {
    id: 'requeue-lost-messages',
    label: 'Re-queue lost mail',
    does: 'Inbound mail saved without its processing job (a restart between save and queue) gets the job again.',
    path: 'requeue-lost-messages',
    scope: 'workspace',
  },
  {
    id: 'repair-swept-reopens',
    label: 'Reopen threads a sweep closed after a reopen',
    does: 'Reopens threads the KB sweep resolved after someone had deliberately reopened them.',
    path: 'repair-swept-reopens',
    scope: 'workspace',
  },
  {
    id: 'repair-buried-conversations',
    label: 'Reopen threads a sweep closed while a customer waited',
    does: 'Reopens threads the KB before-cutoff sweep resolved while the customer was still waiting.',
    path: 'repair-buried-conversations',
    scope: 'workspace',
  },
  {
    id: 'repair-reply-state',
    label: 'Fix stored reply state',
    does: 'Corrects a thread whose stored "waiting on us / on customer" state disagrees with its messages, and its SLA.',
    path: 'repair-reply-state',
    scope: 'workspace',
  },
  {
    id: 'repair-old-imports',
    label: 'Resolve imported history',
    does: 'Files imported threads that were already history when imported (newest message older than the open window) as resolved.',
    path: 'repair-old-imports',
    scope: 'workspace',
  },
  {
    id: 'repair-relayed-direction',
    label: 'Fix relayed mail direction',
    does: 'Our own replies filed as inbound, and relayed form mail with the shop as requester, are corrected.',
    path: 'repair-relayed-direction',
    scope: 'workspace',
    caution:
      'Declare the workspace’s mailbox aliases first, or real customer mail can be read as ours.',
  },
  {
    id: 'backfill-recipients',
    label: 'Fill recipients on old mail',
    does: 'Fills which of our addresses received each message, for mail stored before recipients were kept, then marks mail the team was only copied on or not addressed in — so it stops running an SLA clock and ringing the new-mail bell.',
    path: 'backfill-recipients',
    scope: 'workspace',
  },
  {
    id: 'repair-orphan-spam-logs',
    label: 'Re-link spam log rows',
    does: 'Links spam-log rows that lost their thread, or restores mail that was withheld.',
    path: 'repair-orphan-spam-logs',
    scope: 'workspace',
  },
  {
    id: 'repair-bounce-damage',
    label: 'Repair bounce damage',
    does: 'Fixes what bounces did to threads: messages stranded on merged threads, threads that only ever got bounces.',
    path: 'repair-bounce-damage',
    scope: 'workspace',
  },
  {
    id: 'mark-automatic-replies',
    label: 'Mark automatic replies',
    does: 'Finds acknowledgements and out-of-office replies our mailbox sent (by their Auto-Submitted / Precedence headers) that still count as our answer, and on Apply stops them counting — threads where nobody else answered move from Pending back to Needs us. Runs in the background, slowly: Check queues a dry run, then read the result in “Mark automatic replies: progress”. Apply needs a finished Check from the last hour.',
    path: 'mark-automatic-replies',
    scope: 'workspace',
    caution:
      'Apply only after the progress line shows the finished Check and its counts look right.',
  },
  {
    id: 'mark-automatic-replies-status',
    label: 'Mark automatic replies: progress',
    does: 'The newest run in this workspace: queued, running (with its phase) or finished, with the counts and up to 10 example thread ids. Finished runs are kept for an hour.',
    path: 'mark-automatic-replies',
    scope: 'workspace',
    method: 'get',
    checkOnly: true,
  },
  {
    id: 'repair-cross-mailbox-copies',
    label: 'Remove doubled customer emails',
    does: 'An email two mailboxes of one team both stored shows twice in a thread: the second copy is removed (its files and links move to the first). Copies in another thread are only listed.',
    path: 'repair-cross-mailbox-copies',
    scope: 'workspace',
  },
  {
    id: 'repair-unvalidated-kb-documents',
    label: 'Reject unvalidated KB documents',
    does: 'Rejects KB documents filed without validation, and transaction records (deleted by the 90-day purge).',
    path: 'repair-unvalidated-kb-documents',
    scope: 'workspace',
  },
  {
    id: 'repair-kb-qa-drift',
    label: 'Re-sync drifted KB Q&A',
    does: 'Rewrites Q&A rows whose shown text drifted from the copy AI drafts read (25 per run).',
    path: 'repair-kb-qa-drift',
    scope: 'workspace',
  },
  {
    id: 'audit-mail-sources',
    label: 'Check IMAP sources',
    does: 'Finds IMAP sources saved before settings were validated; Apply switches off the invalid ones still on.',
    path: 'audit-mail-sources',
    scope: 'workspace',
  },
  {
    id: 'retire-degenerate-feedback-rules',
    label: 'Retire rules learned from empty mail',
    does: 'Switches off spam and detection rules that were learned from an empty message body.',
    path: 'retire-degenerate-feedback-rules',
    scope: 'workspace',
  },
  {
    id: 'relayed-fusion-report',
    label: 'Threads holding several customers',
    does: 'Counts threads that relayed form mail merged across more than one customer (report only).',
    path: 'relayed-fusion-report',
    scope: 'workspace',
    method: 'get',
    checkOnly: true,
  },
  {
    id: 'repair-lost-attachments',
    label: 'Find attachments lost to Gmail quota',
    does: 'Finds attachments Gmail refused to hand over when it was asked too fast, per mailbox. Apply records them so the next mailbox checks fetch them again. Check first: it changes nothing.',
    path: 'repair-lost-attachments',
    scope: 'workspace',
    pagedByEventId: true,
  },
  {
    id: 'kb-delete-reason-backfill',
    label: 'Mark old "Delete KB" rows',
    does: 'Marks KB rows deleted with "Delete KB" before reasons were kept, so a re-arriving message cannot bring them back.',
    path: 'kb-delete-reason-backfill',
    scope: 'platform',
  },
  {
    id: 'deleted-at-backfill',
    label: 'Stamp deleted date on old deleted threads',
    does: 'Gives old deleted threads a deleted date, so the 30-day purge can remove them.',
    path: 'deleted-at-backfill',
    scope: 'platform',
    caution: 'Threads stamped today become permanently deletable in 30 days.',
  },
];

/** Repairs that have a screen of their own — listed so the page names every repair. */
export const REPAIRS_ELSEWHERE: Array<{ label: string; where: string }> = [
  { label: 'KB question text clean-up', where: 'Workspace Settings → System → Cleanup' },
  {
    label: 'Split a merged thread',
    where: 'Workspace Settings → System → Cleanup (Bounce repair)',
  },
  {
    label: 'Re-read a KB mailbox’s history',
    where: 'Workspace Settings → System → Cleanup (Knowledge base repair)',
  },
];

/** The flags a repair sets when it stopped at its limit and should be run again. */
export const moreRemains = (result: Record<string, unknown>): boolean => {
  const pagination = result.pagination as Record<string, unknown> | undefined;
  return (
    result.truncated === true ||
    result.moreRemaining === true ||
    (typeof result.remaining === 'number' && result.remaining > 0) ||
    pagination?.truncated === true
  );
};
