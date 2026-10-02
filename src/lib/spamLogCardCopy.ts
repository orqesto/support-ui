/**
 * The words a spam-log card (`spamlog_NN`) shows.
 *
 * A card is a spam-rule RECORD (spam_log row) not attached to a conversation in this view. It is
 * usually a catch record whose conversation is gone, but not always: a record whose message IS in
 * a thread stays a card until a Spam-column load in its workspace links it (25 per load), and a
 * global admin viewing with no workspace selected triggers no linking at all (audit pass 11). So
 * the wording never asserts the conversation is gone — only what holds in every state: a rule
 * recorded it, it is not attached here, and linking happens automatically. It never says
 * "Blocked" or "rejected" either (withheld rows are never cards). Whether the VERDICT was spam is
 * shown separately, by the spam badge driven from `metadata.spamCheck.isSpam`.
 */
const LEAD =
  "A spam rule recorded this message. It isn't attached to a conversation in this view — if the message is in a thread, it is linked automatically when spam is viewed in its workspace.";

export const SPAM_LOG_CARD_COPY = {
  badge: 'Spam-rule record',
  caption: `${LEAD} Everything we kept is shown here.`,
  /** When the backend cut the body at its per-card bound, "everything we kept" is false. */
  captionCut: `${LEAD} Below is the beginning of what we kept.`,
  emptyBody: 'No message body was kept for this record.',
  chip: 'rule record · no thread',
  chipTitle:
    "A spam rule recorded this message; it isn't attached to a conversation here, so there is no thread to open",
} as const;

/**
 * The visible notice for a body the backend cut at its per-card bound — never a silent cut. The
 * numbers are what the backend counts: characters of the STORED SOURCE, markup included (an HTML
 * mail's tags count), so the wording says that rather than implying readable text.
 */
export const spamLogTruncationNotice = (shown: number, total: number): string =>
  `Showing the first ${shown.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} characters of the stored message source (markup included).`;
