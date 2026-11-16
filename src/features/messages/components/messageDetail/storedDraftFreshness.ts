import type { Message, MessageEvent } from '@/types';

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
 * What the thread's detail read says (GET /messages/:id, 2026-11-16): the customer's latest email
 * and the stored draft's age against it by the backend's own rule (suggestionAge). `undefined`:
 * no detail read has said it yet (a list row, or an older backend) — then the events decide.
 */
export type BackendDraftState = {
  latestInbound: NonNullable<Message['latestInbound']> | null;
  storedDraftAge: NonNullable<Message['storedDraftAge']> | null;
};

/**
 * With the backend's state: its latest customer email, unless an email pulled live since was
 * stored after it (then that one). A draft that names its email is offered for that email only
 * (or for one newer than the backend knew — written after the read). A draft that names none is
 * judged by the backend's age only, while the stored draft is the one it judged.
 */
const withBackendState = (
  draft: { answersEventId?: unknown; foundAt?: unknown },
  sortedThread: readonly MessageEvent[],
  backend: BackendDraftState
): StoredDraftFreshness => {
  const known = backend.latestInbound;
  const knownAt = known ? Date.parse(known.at) : -Infinity;
  const inbound = sortedThread.filter((event) => event.type === 'inbound');
  // An email pulled live after the read and stored STRICTLY after the backend's latest (all of
  // them when the read saw none) — the newest such one is the latest now. Strictly: the API's
  // milliseconds cannot split what Postgres's microseconds order, so a tie never hides a draft.
  let latest: { id: number; at: number } | null = known ? { id: known.eventId, at: knownAt } : null;
  for (const event of inbound) {
    const at = Date.parse(event.createdAt);
    if (at > knownAt && (!latest || at > latest.at)) latest = { id: event.id, at };
  }

  const answersEventId = draft.answersEventId;
  if (typeof answersEventId === 'number') {
    if (!latest || answersEventId === latest.id) return { draftHidden: false, pending: false };
    // An email neither the read nor the loaded events know, inserted after the latest (ids are
    // given at insert): newer, not pulled yet — its draft is current. Any loaded one is decided.
    const loaded = inbound.some((event) => event.id === answersEventId);
    return { draftHidden: loaded || answersEventId < latest.id, pending: false };
  }
  const judged = backend.storedDraftAge;
  const sameDraft =
    judged !== null &&
    judged.answersEventId === null &&
    judged.foundAt === (typeof draft.foundAt === 'string' ? draft.foundAt : null);
  // Only the backend's verdict, never a clock compared here (its rule needs the database's zone).
  return { draftHidden: sameDraft && judged.age === 'older', pending: false };
};
