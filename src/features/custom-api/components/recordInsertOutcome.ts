/**
 * What a lookup record's "Use in reply" did, in words the control can put on screen without
 * guessing. The sentence goes into the reply composer (MessageDetail's addRecordToReply).
 */
export type AddOutcome =
  | 'added'
  | 'duplicate'
  /** The composer holds an internal note being written (see MessageDetail). */
  | 'note_in_progress';
