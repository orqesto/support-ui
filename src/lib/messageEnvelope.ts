/**
 * Where the team stands on an inbound email: addressed, only copied, not listed at all (Bcc,
 * forward, mailing list), or written by one of our own colleagues.
 *
 * The backend stamps it on the EVENT as `metadata.envelope` (from 2026-10-20) and returns the same
 * summary with an AI draft. Mail without it — older mail, chat channels, or a backend that does
 * not send it yet — reads as `null` and shows nothing, so the two can ship in either order.
 *
 * Owner decisions 2026-10-20: mail we are only copied on stays in the inbox but runs no SLA clock
 * and rings nobody; the AI draft speaks as a third party. A colleague's mail to a customer is our
 * own side: the draft is a follow-up to the customer.
 */
export type EnvelopePosition = 'to' | 'cc' | 'not_listed';

export type EnvelopeSummary = {
  position: EnvelopePosition;
  senderIsColleague: boolean;
};

const POSITIONS: ReadonlySet<string> = new Set(['to', 'cc', 'not_listed']);

/** Tolerant reader: anything malformed or absent is `null` (version skew, old rows). */
export const readEnvelope = (value: unknown): EnvelopeSummary | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as { position?: unknown; senderIsColleague?: unknown };
  if (typeof raw.position !== 'string' || !POSITIONS.has(raw.position)) return null;
  return {
    position: raw.position as EnvelopePosition,
    senderIsColleague: raw.senderIsColleague === true,
  };
};

/** The event's own envelope (`metadata.envelope`). */
export const eventEnvelope = (metadata: unknown): EnvelopeSummary | null =>
  readEnvelope((metadata as { envelope?: unknown } | null | undefined)?.envelope);

/** The short label on the message itself, with its explanation. `null` = nothing to show. */
export const envelopeBadge = (
  envelope: EnvelopeSummary | null
): { label: string; title: string } | null => {
  if (!envelope) return null;
  if (envelope.senderIsColleague) {
    return {
      label: 'Colleague',
      title: 'Written by a colleague from your own domain, not by a customer.',
    };
  }
  if (envelope.position === 'cc') {
    return {
      label: "You're on Cc",
      title:
        'Written to someone else — your team is only copied. No SLA clock and no new-message alert.',
    };
  }
  if (envelope.position === 'not_listed') {
    return {
      label: 'Not a recipient',
      title:
        'Your team is not among the listed recipients (a blind copy, a forward or a list). No SLA clock and no new-message alert.',
    };
  }
  return null;
};

/** What the AI draft panel says about a draft written for such mail. `null` = nothing. */
export const envelopeDraftHint = (envelope: EnvelopeSummary | null): string | null => {
  if (!envelope) return null;
  if (envelope.senderIsColleague) {
    return 'A colleague wrote this to the customer, so the draft is a follow-up to the customer.';
  }
  if (envelope.position === 'cc') {
    return "You're only on Cc, so the draft is a short note from your team. Add a note if you want it to say more.";
  }
  if (envelope.position === 'not_listed') {
    return "Your team isn't among the recipients, so the draft stays short. Add a note if you want it to say more.";
  }
  return null;
};
