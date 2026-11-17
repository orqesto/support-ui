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
 * Verdicts no customer wrote — the backend's NOT_WRITTEN_BY_CUSTOMER_CATEGORIES (support-service
 * inbox notCustomerWriting.ts: the classifier's messageType is not 'customer'): system mail (a
 * receipt, an out-of-office), noise, junk. Only for the fallback below.
 */
const NOT_WRITTEN_BY_CUSTOMER = new Set([
  'transactional',
  'out_of_office',
  'promotional',
  'unsubscribe',
  'invalid',
  'spam',
  'scam',
  'phishing',
  'security',
]);

/**
 * The customer WRITING, as the backend picks the email a draft answers (support-service
 * latestInboundOrder.ts `customerWritingCondition`; in JS inbox notCustomerWriting.ts
 * `isCustomerWritingEventMeta`, read off what the save and the spam check stamp on the event): its spam verdict is known, not a bounce,
 * not their out-of-office (stamped, a `pause_thread` verdict or an `out_of_office` category), not
 * junk, not a historical import, not a Zendesk import no live mailbox adopted (a copy our mailbox
 * forwarded counts — owner, round 17); a key holding null reads as absent. Those never make a draft "older"
 * (2026-11-17: an out-of-office hid the draft for the real question); a page holding none of the
 * customer's own emails hides nothing. A message pulled before its verdict: the backend drops the
 * older draft once the verdict lands, and the cleared draft reaches the app with the conversation.
 * The backend sends its answer per event (`customerWriting`); these markers are the fallback for a
 * backend that does not yet. Junk and the other verdicts no customer wrote: NOT_WRITTEN_BY_CUSTOMER.
 */
const isCustomerWriting = (event: MessageEvent): boolean => {
  if (event.type !== 'inbound') return false;
  // The backend's own answer (review 2026-11-17 round 13: a copy of its markers can drift); the
  // markers below only for a backend that does not send it yet.
  if (typeof event.customerWriting === 'boolean') return event.customerWriting;
  const meta = (event.metadata ?? {}) as {
    deliveryFailure?: unknown;
    customerAutoReply?: unknown;
    historicalImport?: unknown;
    adoptedAt?: unknown;
    zendesk?: { absorbedLive?: unknown } | null;
    spamCheck?: { category?: unknown; handling?: unknown } | null;
  };
  const category = meta.spamCheck?.category;
  const zendesk = meta.zendesk;
  const importNotAdopted =
    zendesk !== undefined &&
    zendesk !== null &&
    (meta.adoptedAt === undefined || meta.adoptedAt === null) &&
    !(typeof zendesk === 'object' && 'absorbedLive' in zendesk);
  return (
    // Judged: a verdict, or an import a live mailbox adopted (adoption brings no verdict).
    ((meta.spamCheck !== undefined && meta.spamCheck !== null) ||
      (meta.adoptedAt !== undefined && meta.adoptedAt !== null)) &&
    meta.spamCheck?.handling !== 'pause_thread' &&
    meta.deliveryFailure !== true &&
    meta.customerAutoReply !== true &&
    meta.historicalImport !== true &&
    !importNotAdopted &&
    !(typeof category === 'string' && NOT_WRITTEN_BY_CUSTOMER.has(category))
  );
};

/**
 * Is the stored AI draft (`metadata.suggestedAnswer`) one written for an EARLIER customer email?
 * Then it is not offered: a customer's newer email showed the draft for their previous one under
 * it (2026-11-16). The app deletes nothing (the backend drops such a draft when the newer email
 * arrives; this covers the moments before the cleared draft reaches the app). Only a draft that
 * names the email
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
 * ⛔ "Latest" is the backend's pick of the email a draft answers (latestInboundOrder.ts
 * `DRAFT_EMAIL_FIRST`: the customer WRITING first — `isCustomerWriting` — then `createdAt`), not
 * the thread's display order (sent time): the two differ for mail that arrives late. Compared so
 * an equal time (the API's milliseconds cannot split what Postgres's microseconds do) never hides a
 * draft — the backend drops one that is really older.
 */
export function storedDraftFreshness(
  metadata: Record<string, unknown> | null | undefined,
  sortedThread: readonly MessageEvent[],
  eventsState: ThreadEventsState
): StoredDraftFreshness {
  const draft = metadata?.suggestedAnswer as { answersEventId?: unknown } | null | undefined;
  const answersEventId = draft?.answersEventId;
  if (typeof answersEventId !== 'number') return { draftHidden: false, pending: false };
  if (eventsState === 'pending') return { draftHidden: true, pending: true };
  if (eventsState === 'failed') return { draftHidden: false, pending: false };

  const allInbound = sortedThread.filter((event) => event.type === 'inbound');
  const writing = allInbound.filter(isCustomerWriting);
  // The customer's own emails decide. A loaded page with none: one may sit on an earlier page and
  // be the backend's pick (which keeps a draft for an email stored after it) — nothing is known,
  // so offered, even when this page holds the draft's own email (review 2026-11-17).
  if (writing.length === 0) return { draftHidden: false, pending: false };
  const storedAt = (event: MessageEvent) => new Date(event.createdAt).getTime();
  if (writing.some((event) => Number.isNaN(storedAt(event))))
    return { draftHidden: false, pending: false };
  const newestStoredAt = Math.max(...writing.map(storedAt));
  // The draft's email loaded (a customer email or not): hidden only if a later customer email
  // follows it — as the backend, which never drops a draft for an email stored after its pick.
  const named = allInbound.find((event) => event.id === answersEventId);
  if (named && Number.isNaN(storedAt(named))) return { draftHidden: false, pending: false };
  const isLatest = named
    ? storedAt(named) >= newestStoredAt
    : answersEventId > Math.max(...writing.map((event) => event.id));
  return { draftHidden: !isLatest, pending: false };
}
