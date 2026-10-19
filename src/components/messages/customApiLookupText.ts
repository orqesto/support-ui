import type { CustomApiLookupResult } from '@/services/customApiLookup.service';

/**
 * Every agent-facing sentence for a lookup's outcome (2026-10-14). The backend sends CLASSES and
 * facts (`agentReason`, `searchedFor`, `skippedBecause`, `referenceLabel`); the words live here, in
 * one place, so they are i18n-ready and identical on the thread panel and the records page.
 *
 * ⛔ Names come from configuration — the connection, the lookup's label, the source lookup's label,
 * the reference name. No record-kind words are invented here: a lookup may be about anything.
 */

export type FailureClass = NonNullable<CustomApiLookupResult['agentReason']>;

export const GENERIC_FAILURE = 'This lookup could not be completed.';
export const ADMIN_CAN_SEE_DETAILS = 'An admin can see the details.';
export const SHAPE_CHANGED_FOR_AGENTS = 'This lookup needs attention from an admin.';
export const DEFAULT_REFERENCE_NAME = 'Reference';
export const CONVERSATION_NOT_VISIBLE = 'This thread isn’t visible to you.';
export const CONTACT_NOT_VISIBLE = 'This customer isn’t visible to you.';
/** A deployment without the lookup routes (FE/BE skew): said in one line, never a failing button. */
export const LOOKUPS_NOT_ON_SERVER = 'Lookups are not available on this server yet.';
export const NO_MATCH_FALLBACK = 'No matching records for this customer.';

const named = (connection: string, fallback: string) => connection || fallback;

const FAILURE_SENTENCES: Record<FailureClass, (connection: string) => string> = {
  unreachable: (connection) => `We could not reach ${named(connection, 'this system')}.`,
  timeout: (connection) => `${named(connection, 'This system')} took too long to answer.`,
  auth: (connection) => `${named(connection, 'This system')} refused our access.`,
  rate_limited: () => 'Too many lookups right now. Try again in a minute.',
  vendor_error: (connection) => `${named(connection, 'This system')} had a problem answering.`,
  bad_config: () => 'This lookup is not set up correctly.',
  unavailable: () => 'This lookup is no longer available. Refresh the panel and try again.',
};

/**
 * D1: the agent's sentence for a failure class. ⛔ An absent or unknown class (an older backend,
 * or a newer class this build does not know) is the generic sentence — never the raw reason.
 */
export const failureSentence = (agentReason: unknown, connectionName: string): string =>
  typeof agentReason === 'string' && Object.hasOwn(FAILURE_SENTENCES, agentReason)
    ? FAILURE_SENTENCES[agentReason as FailureClass](connectionName)
    : GENERIC_FAILURE;

/** D4: what agents call this lookup's typed value; "Reference" when the admin named none. */
export const referenceNameOf = (label: unknown): string =>
  typeof label === 'string' && label.trim() ? label.trim() : DEFAULT_REFERENCE_NAME;

/**
 * A2/A3/A4: a no-match names what was searched. `typed` is the value this card's own field held,
 * for an older backend that does not echo `searchedFor`.
 */
export const notFoundText = (result: CustomApiLookupResult, typed?: string): string => {
  const searched = result.searchedFor;
  const connection = named(result.connectionName, 'this system');
  if (searched?.kind === 'reference') {
    return `No ${referenceNameOf(result.referenceLabel)} ${searched.value} in ${connection}.`;
  }
  if (searched?.kind === 'email') return `Nothing in ${connection} for ${searched.value}.`;
  if (searched?.kind === 'source') {
    return `Nothing in ${connection} for what “${searched.label}” returned.`;
  }
  if (typed) return `No ${referenceNameOf(result.referenceLabel)} ${typed} in ${connection}.`;
  return NO_MATCH_FALLBACK;
};

/** B3: a chained card that did not run, named by its source lookup. */
export const skippedText = (
  skipped: NonNullable<CustomApiLookupResult['skippedBecause']>
): string => {
  switch (skipped.reason) {
    case 'source_no_match':
      return `Skipped — ${skipped.sourceLabel} found nothing.`;
    case 'source_failed':
      return `Skipped — ${skipped.sourceLabel} could not be completed.`;
    default:
      return `Skipped — ${skipped.sourceLabel} needs the customer’s email, and there is none.`;
  }
};

/** A3: under an identity no-match, when the same connection has a typed-value lookup. */
export const referenceHintText = (referenceName: string): string =>
  `You can still look up by ${referenceName} below.`;

const joinNames = (names: string[]): string =>
  names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/**
 * Before any press: the pane is never empty, and it says which systems a press will ask and about
 * whom (2026-10-15: the sentence sits beside the button, so it no longer says "Press Look up").
 */
export const pressPrompt = (connectionNames: string[], customerEmail?: string): string => {
  const systems = connectionNames.length ? joinNames(connectionNames) : 'the connected systems';
  // A blank address falls back too, so the sentence never ends "for ."
  const who = customerEmail?.trim() ? customerEmail.trim() : 'this customer';
  return `Check ${systems} for ${who}.`;
};

/** How many lookups shown by name before the rest are counted ("+2"). */
const LOOKUPS_NAMED = 3;

/**
 * Under the prompt (2026-10-15): WHICH lookups a press runs, so the count means something.
 * Empty when none are known (an older backend without options), so nothing is claimed.
 */
export const lookupListLine = (labels: string[]): string => {
  const named = labels.filter((label) => label.trim());
  if (named.length === 0) return '';
  const shown = named.slice(0, LOOKUPS_NAMED).join(' · ');
  const rest = named.length - LOOKUPS_NAMED;
  return `${named.length} ${named.length === 1 ? 'lookup' : 'lookups'}: ${shown}${
    rest > 0 ? ` · +${rest}` : ''
  }`;
};
