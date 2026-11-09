import { formatDay } from '@/lib/utils';

/**
 * Hold notes: internal notes the backend writes when a thread goes on hold or comes off it
 * (`comments.source = 'hold'`). They are drawn in the On-hold colour (violet, the `pending`
 * token) rather than the amber of an ordinary note, and they are a record of an event, so they
 * offer no edit or delete. Notes without a `source` (older backends, older rows) are ordinary.
 *
 * Their text is built HERE, from `metadata`, not read from `content`: the backend writes the date
 * into `content` in UTC ("On hold until 12 Nov 2026: …"), which is the wrong day for anyone far
 * from UTC. `content` is only the fallback for a note whose metadata is missing or malformed.
 */
export type HoldNoteFields = {
  source?: string | null;
  metadata?: Record<string, unknown> | null;
  content?: string;
};

export const isHoldNote = (note: HoldNoteFields): boolean => note.source === 'hold';

/** "Off hold" for the note written when a thread leaves hold, "On hold" otherwise. */
export const holdNoteLabel = (note: HoldNoteFields): string =>
  note.metadata?.kind === 'unhold' ? 'Off hold' : 'On hold';

/** A `kind: 'hold'` note's metadata, read defensively; null when absent or malformed. */
export type HoldMetadata = {
  reason: string | null;
  until: Date | null;
  reasonCleared: boolean;
};

const isValidDate = (date: Date) => !Number.isNaN(date.getTime());

export const holdMetadataOf = (note: HoldNoteFields): HoldMetadata | null => {
  if (!isHoldNote(note)) return null;
  const meta = note.metadata;
  if (!meta || typeof meta !== 'object' || meta.kind !== 'hold') return null;
  const { reason, until, reasonClearedAt } = meta;
  if (reason !== undefined && reason !== null && typeof reason !== 'string') return null;
  if (until !== undefined && until !== null && typeof until !== 'string') return null;
  const untilDate = typeof until === 'string' ? new Date(until) : null;
  if (untilDate && !isValidDate(untilDate)) return null;
  return {
    reason: typeof reason === 'string' && reason.trim() ? reason.trim() : null,
    until: untilDate,
    reasonCleared: typeof reasonClearedAt === 'string' && reasonClearedAt.length > 0,
  };
};

/**
 * A hold note's text: "On hold until <date>: <reason>", "On hold until <date>", "On hold:
 * <reason>" or "On hold", the date in the viewer's time zone and the app's day format
 * (`formatDay`, as the header chip shows the same date). A reason an admin removed reads
 * " · reason removed" instead. Anything else (an Off-hold note, missing or malformed metadata)
 * is the note's stored `content`.
 */
export const holdNoteText = (note: HoldNoteFields, timeZone?: string): string => {
  const meta = holdMetadataOf(note);
  if (!meta) return note.content ?? '';
  const head = meta.until ? `On hold until ${formatDay(meta.until, timeZone)}` : 'On hold';
  if (meta.reasonCleared) return `${head} · reason removed`;
  return meta.reason ? `${head}: ${meta.reason}` : head;
};

/** A hold note whose reason a workspace admin may still clear. */
export const holdReasonClearable = (note: HoldNoteFields): boolean => {
  const meta = holdMetadataOf(note);
  return Boolean(meta?.reason) && !meta?.reasonCleared;
};
