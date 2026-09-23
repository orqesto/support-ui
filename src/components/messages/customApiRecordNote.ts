import { renderValue } from './customApiRowFields';
import {
  CATEGORY_RECORD_LABELS,
  type CustomApiCategory,
} from '@/components/settings/customApi/categories';
import type { LookupField } from '@/services/customApiLookup.service';

/**
 * L2 P4 — turning ONE vendor record into a line the AI draft can be built on.
 *
 * The note goes into the reply note an agent already writes by hand ("we've fixed it on our
 * side"), which the backend hands the model inside `<agent_instructions>` and tells it to treat
 * as fact. So everything here is answerable in one sentence: what would an agent have typed?
 *
 * ⛔ NOTHING IS INVENTED AND NOTHING IS REWORDED. The values are exactly what the panel shows —
 * the admin's word for a status where P2 has one, the vendor's own value where it does not, the
 * currency beside a total. A note that said "shipped" where the panel said `3` would be the
 * product guessing at a vendor's meaning inside a customer-facing reply.
 *
 * ⛔ THE AGENT CHOOSES THE FIELDS. A record holds things an agent may not want to send — the
 * customer's own address, a total on a thread that is not about money. The caller passes the
 * selection; this module only composes.
 */

/**
 * What an answer usually needs, by role.
 *
 * ⛔ CONFIGURATION, NOT INFERENCE (scope §P4). The reference identifies the thing, the status is
 * what the customer asked about, the date is what makes the status meaningful. A total is left
 * OUT of the default on purpose: money in a reply is a commitment, and an agent should have to
 * choose it rather than un-choose it. `customer_email` is never defaulted — telling customers
 * their own address back is at best noise.
 */
export const DEFAULT_INSERT_ROLES = ['identifier', 'status', 'date'] as const;

/** Roles that may be offered at all. `currency` is excluded: it renders WITH its total. */
const OFFERABLE_ROLES = ['identifier', 'status', 'date', 'total', 'customer_email'];

const MISSING = '—';

const roleOf = (field: LookupField): string | null => {
  const value = (field as { role?: unknown }).role;
  return typeof value === 'string' ? value : null;
};

/**
 * The fields this record can offer, in a fixed order.
 *
 * ⚠️ ORDERED BY ROLE, not by the admin's field order: the note reads as a sentence and the
 * reference has to come first for it to be one. A field with no value on this row is not offered
 * at all — an agent cannot send what the vendor did not say, and an empty checkbox invites them
 * to think they can.
 */
export const offerableFields = (
  row: Record<string, unknown>,
  fields: LookupField[]
): LookupField[] =>
  OFFERABLE_ROLES.flatMap((role) =>
    fields.filter((field) => roleOf(field) === role && renderValue(row, field) !== MISSING)
  );

/** The paths selected when the picker first opens. */
export const defaultSelection = (
  row: Record<string, unknown>,
  fields: LookupField[]
): string[] =>
  offerableFields(row, fields)
    .filter((field) => (DEFAULT_INSERT_ROLES as readonly string[]).includes(roleOf(field) ?? ''))
    .map((field) => field.path);

/**
 * The note itself: `Shipment 137416 — Status: On its way. Placed: 2026-09-01.`
 *
 * ⛔ THE CATEGORY NAMES THE THING. Without it the model is handed bare values and has to guess
 * what they belong to, which is how "137416" becomes an invoice number in a reply about a parcel.
 * With no category the note still says what the lookup was called, which is the admin's own word
 * for these records.
 *
 * Returns null when the selection renders nothing — there is no such thing as an empty fact, and
 * a caller must not append an empty line to an agent's note.
 */
export const buildRecordNote = ({
  row,
  fields,
  category,
  selectedPaths,
  lookupLabel,
}: {
  row: Record<string, unknown>;
  fields: LookupField[];
  category: CustomApiCategory | null;
  selectedPaths: string[];
  lookupLabel: string;
}): string | null => {
  const chosen = offerableFields(row, fields).filter((field) =>
    selectedPaths.includes(field.path)
  );
  if (chosen.length === 0) return null;

  const noun = category ? CATEGORY_RECORD_LABELS[category] : lookupLabel.trim() || 'Record';
  const identifier = chosen.find((field) => roleOf(field) === 'identifier');
  const rest = chosen.filter((field) => field !== identifier);

  const head = identifier ? `${noun} ${renderValue(row, identifier)}` : noun;
  if (rest.length === 0) return `${head}.`;

  const detail = rest
    .map((field) => `${field.label}: ${renderValue(row, field)}`)
    .join('. ');
  return `${head} — ${detail}.`;
};

/**
 * Add the note to what the agent has already written.
 *
 * ⛔ APPENDED, NEVER REPLACED. The agent's own sentences are the part of this the model trusts
 * most, and the one failure that makes people stop using a feature is text of theirs vanishing.
 *
 * ⛔ REFUSES RATHER THAN TRUNCATES when it will not fit (scope §P4). The backend caps
 * `agentInstructions` at 2000 characters with a plain `.slice()`, so a note appended past the
 * limit would be cut MID-FACT — "Total: 348" instead of "348.50" — and nothing anywhere would
 * say so. A refusal the agent can see and act on is the only honest end of that road.
 */
export const appendNote = (
  current: string,
  note: string,
  limit: number
): { text: string; added: boolean; reason?: 'duplicate' | 'too_long' } => {
  const trimmed = current.trim();
  /*
    Already there — pressing the same record twice should not say it twice to the model, and the
    REASON travels back because "you already added this" and "your note is full" ask the agent for
    two different things. A single `added: false` would have the control tell them to shorten a
    note that is fine.
  */
  if (trimmed.includes(note)) return { text: current, added: false, reason: 'duplicate' };
  const next = trimmed === '' ? note : `${trimmed} ${note}`;
  if (next.length > limit) return { text: current, added: false, reason: 'too_long' };
  return { text: next, added: true };
};
