import { apiErrorMessage, apiErrorStatus } from '@/lib/apiError';

/**
 * What a mailbox's import-range save did, in words, for the Gmail and IMAP range dialogs.
 *
 * Moving the import start EARLIER on a mailbox that has already synced restarts the import
 * for the new range; the response then carries `importRestarted: true`. Before that, saving a
 * new range on a synced mailbox fetched nothing older — and the IMAP dialog promised it would
 * "sync … on next polling cycle". An older backend sends no flag, so absent means "nothing
 * was restarted" and the message must not promise an import.
 *
 * The backend restarts the import whether or not the mailbox is paused, but a paused mailbox
 * (`enabled: false`) is never polled: the older mail arrives only once its sync is started.
 * The range label is used as written ("Since 5 Mar 2026", "Last 30 Days") — lower-cased into a
 * sentence it read "from since 5 mar 2026".
 */
export const rangeSavedMessage = ({
  importRestarted,
  enabled,
  rangeLabel,
}: {
  importRestarted: boolean;
  /** The mailbox is being polled. Absent = unknown, read as polled (the pre-existing wording). */
  enabled?: boolean;
  rangeLabel: string;
}): string => {
  const set = `Import range set: ${rangeLabel}.`;
  if (!importRestarted) {
    return `${set} It is used for the mailbox's first sync; mail already imported is kept.`;
  }
  return enabled === false
    ? `${set} Older mail in that range will be imported once this mailbox's sync is started — nothing is imported while it is paused.`
    : `${set} Older mail in that range is being imported now. It appears over the next few polls — a long range can take a while.`;
};

/**
 * The server refused because a poll of this mailbox is running: nothing was saved, and the
 * same values can be sent again in a minute. Returns the server's sentence, or null for any
 * other failure (which keeps its usual alert).
 */
export const syncRunningRefusal = (error: unknown): string | null => {
  const code = (error as { data?: { code?: unknown } } | null | undefined)?.data?.code;
  if (apiErrorStatus(error) !== 409 || code !== 'IMPORT_RANGE_SYNC_RUNNING') return null;
  return apiErrorMessage(error, 'This mailbox is syncing right now. Try again in a minute.');
};
