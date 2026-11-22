import { getErrorBody } from '@/lib/errorMessages';

/**
 * The customer only thanked us: AI draft from an empty editor writes nothing (owner 2026-11-20).
 * compose-reply answers 409 with body `{ code: 'NO_REPLY_NEEDED' }` — test the CODE (the same
 * status also means "AI drafts off" and "no customer message").
 */
export const NO_REPLY_NEEDED_MESSAGE =
  'No reply needed — the customer only said thanks. Type what you want to say, then press AI draft.';

export const isNoReplyNeededError = (err: unknown): boolean =>
  getErrorBody(err)?.code === 'NO_REPLY_NEEDED';
