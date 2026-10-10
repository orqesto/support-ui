/** Words for the import-progress panel that are not tied to one render branch. */

/** BE `sweep_owed`: a knowledge-base IMAP run has stored everything, but its history read is not over. */
export const SWEEP_OWED_LINE =
  'Every listed message is in; the knowledge-base history read has not finished yet.';

/** Held "Finished" for an IMAP run: everything listed is stored (imported >= total). */
export const HISTORY_READ_PENDING_ALL_IN =
  'Every listed message is in; the mailbox read has not finished yet';

/** Held "Finished" for an IMAP run when not every listed message is known to be stored. */
export const HISTORY_READ_PENDING = 'The mailbox read has not finished yet';

/** Gmail only: an IMAP failure sentence already says what to do. */
export const COUNT_PENDING_SUFFIX = ' Progress will show once it has been counted.';

export const imapUnverifiableLine = (count: number): string =>
  count === 1
    ? '1 message has no Message-ID and is not counted.'
    : `${count.toLocaleString()} messages have no Message-ID and are not counted.`;
