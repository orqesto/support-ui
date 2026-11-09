/**
 * Hold notes: internal notes the backend writes when a thread goes on hold or comes off it
 * (`comments.source = 'hold'`). They are drawn in the On-hold colour (violet, the `pending`
 * token) rather than the amber of an ordinary note, and they are a record of an event, so they
 * offer no edit or delete. Notes without a `source` (older backends, older rows) are ordinary.
 */
export type HoldNoteFields = {
  source?: string | null;
  metadata?: Record<string, unknown> | null;
};

export const isHoldNote = (note: HoldNoteFields): boolean => note.source === 'hold';

/** "Off hold" for the note written when a thread leaves hold, "On hold" otherwise. */
export const holdNoteLabel = (note: HoldNoteFields): string =>
  note.metadata?.kind === 'unhold' ? 'Off hold' : 'On hold';
