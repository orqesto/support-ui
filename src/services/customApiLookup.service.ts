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
export type CustomApiLookupResult = components['schemas']['CustomApiLookupResult'];

export type LookupOwnership = NonNullable<CustomApiLookupResult['ownership']>;
/** CA-6: a record already fetched by an earlier lookup and kept by D37's store. */
export type CustomApiStoredRecord = components['schemas']['CustomApiStoredRecord'];
/** CA-6: a lookup an agent could run — label, vendor and whether it takes a typed reference. */
export type RunnableLookup = components['schemas']['CustomApiRunnableLookup'];
export type LookupField = NonNullable<CustomApiLookupResult['fields']>[number];

export interface LookupRequest {
  conversationId?: number;
  contactId?: number;
  /** A manual lookup's value, or the record the customer NAMED — both are verified (D35). */
  endpointId?: number;
  parameter?: string;
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
const normalise = (row: CustomApiLookupResult): CustomApiLookupResult => ({
  ...row,
  rows: row.rows ?? [],
  fields: row.fields ?? [],
  suggestions: row.suggestions ?? [],
});

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
    const res = await apiClient.post<{ success: boolean; data: CustomApiLookupResult[] }>(
      '/api/custom-apis/lookup',
      body
    );
    return (res.data.data ?? []).map(normalise);
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
    return res.data.data ?? [];
  },
};
