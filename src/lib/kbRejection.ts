/**
 * A rejected knowledge-base entry is hidden at once and hard-deleted by the backend's daily
 * purge this many days after `rejectedAt` (`kbRejectPurge.ts`, owner decision 2026-09-19).
 * Approving it again inside the window restores it.
 */
export const REJECTED_RETENTION_DAYS = 90;

/**
 * The backend's `metadata.rejectedReason` for an automatic Q&A it retired itself: a duplicate
 * automatic capture of the same ticket, or one a "Save to KB" capture of it superseded.
 */
export const AUTO_CAPTURE_SUPERSEDED = 'auto_capture_superseded';
/** True in every state: it does not claim the capture that superseded it still exists. */
export const AUTO_SUPERSEDED_NOTE =
  'Automatic duplicate — rejected automatically as a repeat capture of this ticket';

/**
 * Rejected automatically as a superseded capture? Needs no rejecting user, as the backend's own
 * check does: a person's reject that carries a stale reason is that person's. False when the
 * backend does not say.
 */
export const isAutoSupersededReject = (entry: {
  rejectedAt?: string | null;
  rejectedBy?: number | null;
  metadata?: Record<string, unknown>;
}): boolean =>
  Boolean(entry.rejectedAt) &&
  (entry.rejectedBy === null || entry.rejectedBy === undefined) &&
  entry.metadata?.rejectedReason === AUTO_CAPTURE_SUPERSEDED;

/** The day the purge may delete a row rejected at `rejectedAt`, or null when it is not rejected. */
export const purgeDateOf = (rejectedAt: string | null | undefined): Date | null => {
  if (!rejectedAt) return null;
  const at = new Date(rejectedAt);
  if (Number.isNaN(at.getTime())) return null;
  return new Date(at.getTime() + REJECTED_RETENTION_DAYS * 24 * 60 * 60 * 1000);
};

export const formatPurgeDate = (rejectedAt: string | null | undefined): string | null => {
  const date = purgeDateOf(rejectedAt);
  return date
    ? date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : null;
};
