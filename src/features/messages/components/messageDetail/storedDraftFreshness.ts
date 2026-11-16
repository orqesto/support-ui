import type { MessageEvent } from '@/types';

/**
 * Does the stored AI draft (`metadata.suggestedAnswer`) answer the customer's LATEST email?
 *
 * A customer's thanks-type email ("Yes, it arrived, thank you") needs no reply, and the draft
 * written for their EARLIER email (an apology for a delayed order) was shown again under it
 * (2026-11-16). The backend now removes that draft and marks the email
 * (`metadata.noReplyForEventId`); this is the frontend's side of the same rule, and the backstop
 * for a thread the backend has not reached yet:
 *  - `stale`: the draft names the email it answers (`answersEventId`) and a customer email
 *    stored AFTER that one exists — it is not offered, and no "No suggestion found" is shown
 *    while the backend writes the new one;
 *  - `noReplyWanted`: the latest customer email was judged to need no reply — no suggestion at
 *    all (owner 2026-11-16), unless the stored draft answers that very email (an agent's saved
 *    answer: the backend keeps it, so it is shown).
 *
 * Until the thread's events load, a draft or a mark that names an email cannot be checked: it is
 * held back (`stale` / `noReplyWanted`), so a draft for an earlier email is never one click away
 * on a cold open. A draft that names no email (older writers, agent saves) is shown as before.
 *
 * ⛔ "Stored after" is the backend's order (latestInboundEvent.ts `LATEST_INBOUND_FIRST`: every
 * `inbound` event by `createdAt`), not the thread's display order (sent time): the two differ
 * for mail that arrives late. Compared strictly, so an equal time (the API's milliseconds cannot
 * split what Postgres's microseconds do) never hides a draft — the backend replaces one that is
 * really older.
 */
export function storedDraftFreshness(
  metadata: Record<string, unknown> | null | undefined,
  sortedThread: readonly MessageEvent[]
): { stale: boolean; noReplyWanted: boolean } {
  const inbound = sortedThread.filter((event) => event.type === 'inbound');
  const storedAt = (event: MessageEvent) => new Date(event.createdAt).getTime();
  // Is the customer email `id` among the loaded ones, with none stored after it?
  const isLatest = (id: number): boolean => {
    const named = inbound.find((event) => event.id === id);
    return named !== undefined && !inbound.some((event) => storedAt(event) > storedAt(named));
  };

  const draft = metadata?.suggestedAnswer as { answersEventId?: unknown } | null | undefined;
  const answersEventId = draft?.answersEventId;
  const draftNamesEmail = typeof answersEventId === 'number';
  const draftIsCurrent = draftNamesEmail && isLatest(answersEventId);

  const mark = metadata?.noReplyForEventId;
  return {
    stale: draftNamesEmail && !draftIsCurrent,
    noReplyWanted:
      typeof mark === 'number' &&
      !(draftIsCurrent && answersEventId === mark) &&
      (inbound.length === 0 || isLatest(mark)),
  };
}
