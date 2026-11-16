import type { BackendDraftState } from '@/services/message/message.types';
import type { MessageEvent } from '@/types';

/** Where the thread's events stand: not read yet for this conversation, read, or the read failed. */
export type ThreadEventsState = 'pending' | 'loaded' | 'failed';

export type StoredDraftFreshness = {
  /** The stored draft is not offered (thread and KB tab). */
  draftHidden: boolean;
  /** Not known yet (the events not read): the KB tab reports no count meanwhile. */
  pending: boolean;
};

/**
 * Is the stored AI draft (`metadata.suggestedAnswer`) one written for an EARLIER customer email?
 * Then it is not offered: a customer's newer email showed the draft for their previous one under
 * it (2026-11-16). Nothing is deleted and no AI verdict is used. Only a draft that names the email
 * it answers (`answersEventId`, every backend writer since 2026-11-04) is checked; one that names
 * none is offered as before — the backend never judges such a draft by a guess either.
 *
 * Events: a page of the thread plus live pulls.
 *  - `pending` (not read yet): a draft that names an email is held back (the ghost shows its
 *    spinner meanwhile) — never a draft for an earlier email one click away on a cold open;
 *  - `failed`: offered as before — a failed read never hides it for good;
 *  - `loaded`: an email id newer than every loaded customer email (metadata arrived before the
 *    event was pulled, or the page holds none) counts as the latest; an older id not loaded sits
 *    on an earlier page — not the latest. A time that does not parse hides nothing.
 *
 * ⛔ "Latest" is the backend's order (latestInboundEvent.ts `LATEST_INBOUND_FIRST`: every `inbound`
 * event by `createdAt`), not the thread's display order (sent time): the two differ for mail that
 * arrives late. Compared so an equal time (the API's milliseconds cannot split what Postgres's
 * microseconds do) never hides a draft — the backend replaces one that is really older.
 */
export function storedDraftFreshness(
  metadata: Record<string, unknown> | null | undefined,
  sortedThread: readonly MessageEvent[],
  eventsState: ThreadEventsState,
  backend?: BackendDraftState
): StoredDraftFreshness {
  const stored = metadata?.suggestedAnswer as
    | { answersEventId?: unknown; foundAt?: unknown }
    | null
    | undefined;
  if (stored && typeof stored === 'object' && backend !== undefined)
    return withBackendState(stored, sortedThread, backend);
  return fromEventsOnly(stored, sortedThread, eventsState);
}

/** No detail read yet (or an older backend): the loaded events decide — #969's rule. */
function fromEventsOnly(
  draft: { answersEventId?: unknown } | null | undefined,
  sortedThread: readonly MessageEvent[],
  eventsState: ThreadEventsState
): StoredDraftFreshness {
  const answersEventId = draft?.answersEventId;
  if (typeof answersEventId !== 'number') return { draftHidden: false, pending: false };
  if (eventsState === 'pending') return { draftHidden: true, pending: true };
  if (eventsState === 'failed') return { draftHidden: false, pending: false };

  const inbound = sortedThread.filter((event) => event.type === 'inbound');
  if (inbound.length === 0) return { draftHidden: false, pending: false };
  const storedAt = (event: MessageEvent) => new Date(event.createdAt).getTime();
  if (inbound.some((event) => Number.isNaN(storedAt(event))))
    return { draftHidden: false, pending: false };
  const newestStoredAt = Math.max(...inbound.map(storedAt));
  const named = inbound.find((event) => event.id === answersEventId);
  const isLatest = named
    ? storedAt(named) >= newestStoredAt
    : answersEventId > Math.max(...inbound.map((event) => event.id));
  return { draftHidden: !isLatest, pending: false };
}

/**
 * What the thread read says (GET /messages/:id/thread → `storedDraft`, support-service #1578): the
 * customer's latest email and the stored draft's age against it, by the backend's own rule
 * (suggestionAge), with the draft it judged. Sent on every read — the full one and each live
 * pull — so it is as fresh as the events. `undefined`: an older backend; the events decide.
 */

const sameTime = (left: unknown, right: unknown): boolean =>
  typeof left === 'string' &&
  typeof right === 'string' &&
  !Number.isNaN(Date.parse(left)) &&
  Date.parse(left) === Date.parse(right);

/**
 * The backend's verdict, while the stored draft is the one it judged (same `answersEventId`, or the
 * same `foundAt` for a draft that names no email). A draft written since the last read is the
 * backend's new one for the latest email: offered, unless it names a loaded email that a later
 * customer email follows (strictly later: a tie never hides a draft).
 */
const withBackendState = (
  draft: { answersEventId?: unknown; foundAt?: unknown },
  sortedThread: readonly MessageEvent[],
  backend: BackendDraftState
): StoredDraftFreshness => {
  const judged = backend.storedDraftAge;
  const answersEventId = draft.answersEventId;
  const sameDraft =
    judged !== null &&
    (typeof answersEventId === 'number'
      ? judged.answersEventId === answersEventId
      : judged.answersEventId === null && sameTime(judged.foundAt, draft.foundAt));
  if (sameDraft) return { draftHidden: judged.age === 'older', pending: false };
  if (typeof answersEventId !== 'number') return { draftHidden: false, pending: false };
  // Older than the email the read names (an earlier page, a stale copy of the metadata): hidden.
  const latest = backend.latestInbound;
  if (latest && answersEventId < latest.eventId) return { draftHidden: true, pending: false };
  const inbound = sortedThread.filter((event) => event.type === 'inbound');
  const named = inbound.find((event) => event.id === answersEventId);
  const followed =
    named !== undefined &&
    inbound.some((event) => Date.parse(event.createdAt) > Date.parse(named.createdAt));
  return { draftHidden: followed, pending: false };
};
