/**
 * A rejected knowledge-base entry is hidden at once and hard-deleted by the backend's daily
 * purge this many days after `rejectedAt` (`kbRejectPurge.ts`, owner decision 2026-09-19).
 * Approving it again inside the window restores it.
 */
export const REJECTED_RETENTION_DAYS = 90;

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
