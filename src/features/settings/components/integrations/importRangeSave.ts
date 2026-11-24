import { apiErrorMessage, apiErrorStatus } from '@/lib/apiError';

/**
 * What a mailbox's import-range save did, in words, for the Gmail and IMAP range dialogs.
 *
 * Moving the import start EARLIER on a mailbox that has already synced restarts the import
 * for the new range; the response then carries `importRestarted: true`. Before that, saving a
 * new range on a synced mailbox fetched nothing older — and the IMAP dialog promised it would
 * "sync … on next polling cycle". An older backend sends no flag, so absent means "nothing
 * was restarted" and the message must not promise an import.
 */
export const rangeSavedMessage = (importRestarted: boolean, rangeLabel: string): string =>
  importRestarted
    ? `Older mail from ${rangeLabel} is being imported now. It appears over the next few polls — a long range can take a while.`
    : `Import range set to ${rangeLabel}. It is used for the mailbox's first sync; mail already imported is kept.`;

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
