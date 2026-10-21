import { apiClient } from '@/lib/api-client';
import type { components } from '@/types/generated/api';

/**
 * The agent-facing custom-API lookup (CA-3).
 *
 * ⛔ A DIFFERENT SURFACE from `/api/custom-apis`, which configures integrations and is admin-only.
 * This one is gated on the CONVERSATION (D28), because `support` and `associate` hold no
 * integration permission at all and are exactly the people who need it. Nothing here reads or
 * shows configuration — the response carries resolved fields and never a base URL, header or
 * credential state.
 *
 * The shape is GENERATED from the backend contract, not hand-written: a local copy can disagree
 * with the API silently, which is the class of bug that cost three audit passes on the backend.
 */
export type CustomApiLookupResult = components['schemas']['CustomApiLookupResult'] & {
  /**
   * 2026-10-21: the admin's own words for "this lookup found nothing" ("Ask the customer for their
   * order number."), shown verbatim under the not-found line. ⛔ OPTIONAL: an older backend does not
   * send it, and absent means nothing is shown. Read only through `noMatchHintText`.
   */
  noMatchHint?: string | null;
};

export type LookupOwnership = NonNullable<CustomApiLookupResult['ownership']>;
/** CA-6: a record already fetched by an earlier lookup and kept by D37's store. */
export type CustomApiStoredRecord = components['schemas']['CustomApiStoredRecord'];
/**
 * CA-6: a lookup an agent could run — label, vendor and whether it takes a typed reference.
 * `category` is now in the generated type (regenerated 2026-10-09); a backend older than that does
 * not send it, and this frontend deploys on merge while the backend ships on a tag, so readers
 * still treat it as possibly absent at runtime.
 */
export type RunnableLookup = components['schemas']['CustomApiRunnableLookup'];
export type LookupField = NonNullable<CustomApiLookupResult['fields']>[number];

export interface LookupRequest {
  conversationId?: number;
  contactId?: number;
  /** A manual lookup's value, or the record the customer NAMED — both are verified (D35). */
  endpointId?: number;
  parameter?: string;
  /**
   * Run every lookup AS this email instead of the ticket's own customer (2026-09-29): a shop's
   * order notification names the buyer only in its body, so the agent types them in.
   */
  lookupEmail?: string;
}

/** A run's results, plus the email the BACKEND confirms it ran as (null: the ticket's customer). */
export interface LookupRun {
  results: CustomApiLookupResult[];
  /**
   * ⛔ Only what the backend ECHOED. An older backend drops an unknown `lookupEmail` and answers for
   * the ticket's own customer; trusting the request would label those records as the typed person's.
   */
  lookedUpAs: string | null;
}

/**
 * ⚠️ FE/BE SKEW. A push to `main` deploys this frontend, while the backend ships on a tag — so this
 * panel can reach production BEFORE the CA-3 backend does, and will meet older responses either
 * way. Every field the component reads is normalised here, because a component reading a field the
 * deployed backend does not send yet white-screens the whole thread view.
 *
 * ⛔ `ownership` is deliberately NOT defaulted to a value. Absent means "this backend does not do
 * ownership checks", which the panel renders as no claim at all — defaulting it to 'owned' would
 * assert something no backend told us, and defaulting to 'mismatch' would flag every record on an
 * older deployment.
 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A4 (2026-10-14): a `searchedFor` this build can render, or none — a malformed one is dropped,
 * not shown. A source with no label would read as an empty quote, so it is dropped too.
 */
const readSearchedFor = (raw: unknown): CustomApiLookupResult['searchedFor'] => {
  if (!isRecord(raw)) return undefined;
  if (raw.kind === 'source' && typeof raw.label === 'string' && raw.label.trim()) {
    return { kind: 'source', label: raw.label };
  }
  if ((raw.kind === 'email' || raw.kind === 'reference') && typeof raw.value === 'string') {
    return { kind: raw.kind, value: raw.value };
  }
  return undefined;
};

const SKIP_REASONS = ['source_no_match', 'source_failed', 'source_no_identity'] as const;

/** B3: a `skippedBecause` with a known reason and a label to name, or none. */
const readSkippedBecause = (raw: unknown): CustomApiLookupResult['skippedBecause'] => {
  if (!isRecord(raw) || typeof raw.sourceLabel !== 'string' || !raw.sourceLabel.trim()) {
    return undefined;
  }
  const reason = SKIP_REASONS.find((known) => known === raw.reason);
  return reason ? { reason, sourceLabel: raw.sourceLabel } : undefined;
};

const normalise = (row: CustomApiLookupResult): CustomApiLookupResult => {
  const searchedFor = readSearchedFor(row.searchedFor);
  const skippedBecause = readSkippedBecause(row.skippedBecause);
  const { searchedFor: _searched, skippedBecause: _skipped, ...rest } = row;
  return {
    ...rest,
    rows: row.rows ?? [],
    fields: row.fields ?? [],
    suggestions: row.suggestions ?? [],
    // 2026-10-14 fields: absent from an older backend. `agentReason` stays as sent (absent = an
    // older backend); the card reads it through `failureSentence`, which refuses unknown classes.
    referenceLabel: typeof row.referenceLabel === 'string' ? row.referenceLabel : null,
    ...(searchedFor ? { searchedFor } : {}),
    ...(skippedBecause ? { skippedBecause } : {}),
  };
};

/** Which panel is asking. An endpoint declares where it renders (D15), so the answer differs. */
export type LookupSurface = 'thread' | 'contact';

export const customApiLookupService = {
  /**
   * Does this caller have ANY lookup a press on this surface could run? Decides whether the panel
   * renders at all.
   *
   * ⛔ NOT A LOOKUP. It reads configuration on OUR backend — no vendor is called and no customer
   * data comes back — so asking it on mount keeps SC1: nothing is LOOKED UP until the press.
   */
  async availability(surface: LookupSurface): Promise<boolean> {
    const res = await apiClient.get<{ success: boolean; data?: { available?: boolean } }>(
      '/api/custom-apis/lookup/availability',
      { params: { surface } }
    );
    // Fail CLOSED: a response without the flag is not a yes.
    return res.data.data?.available === true;
  },

  /**
   * Run every eligible lookup for this customer, or one manual lookup with a supplied value.
   *
   * ⛔ ONLY EVER CALLED FROM A PRESS. N enabled endpoints must not become N outbound calls every
   * time an agent opens a thread (SC1) — the panel has no effect that fires on mount.
   */
  async run(body: LookupRequest): Promise<CustomApiLookupResult[]> {
    return (await this.runDetailed(body)).results;
  },

  async runDetailed(body: LookupRequest): Promise<LookupRun> {
    const res = await apiClient.post<{
      success: boolean;
      data: CustomApiLookupResult[];
      lookedUpAs?: unknown;
    }>('/api/custom-apis/lookup', body);
    return {
      results: (res.data.data ?? []).map(normalise),
      lookedUpAs: typeof res.data.lookedUpAs === 'string' ? res.data.lookedUpAs : null,
    };
  },

  /**
   * CA-6: what we ALREADY hold about this customer, for the records page.
   *
   * ⛔ THIS IS NOT A LOOKUP AND MUST NEVER BECOME ONE. It reads our own store, so a PAGE may call
   * it on open without breaching SC1 — nothing reaches a vendor. That is the only reason the page
   * can show anything before the agent presses something (D45).
   *
   * ⚠️ An older backend has no such route and answers the SPA's HTML 404, so a failure here is
   * "this deployment has no records endpoint yet", not "this customer has no records" — the caller
   * distinguishes them, because rendering an empty list for a skewed deployment would state
   * something false about the customer.
   */
  async storedRecords(contactId: number): Promise<CustomApiStoredRecord[]> {
    const res = await apiClient.get<{ success: boolean; data?: CustomApiStoredRecord[] }>(
      '/api/custom-apis/records',
      { params: { contactId } }
    );
    return res.data.data ?? [];
  },

  /**
   * CA-6: which lookups a press could run here — so the records page can show its reference box
   * without making the agent press something else first (D44).
   *
   * ⛔ NOT A LOOKUP: configuration is read on our own side, nothing reaches a vendor (SC1).
   */
  async lookupOptions(surface: LookupSurface): Promise<RunnableLookup[]> {
    const res = await apiClient.get<{ success: boolean; data?: RunnableLookup[] }>(
      '/api/custom-apis/lookup/options',
      { params: { surface } }
    );
    // 2026-10-14 (D4): an older backend sends no reference name; null reads as "Reference".
    return (res.data.data ?? []).map((option) => ({
      ...option,
      referenceLabel: typeof option.referenceLabel === 'string' ? option.referenceLabel : null,
    }));
  },
};
