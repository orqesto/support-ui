/**
 * L2 categories — what kind of record a custom-API lookup returns.
 *
 * ⛔ ONE list, mirroring the backend's `CUSTOM_API_CATEGORIES`. The backend refuses a word it does
 * not know (400 on save) and reads an unknown stored value as null, so a frontend list that drifts
 * produces an option an admin can pick and never save — which is #789's failure with the sides
 * swapped: there the writer refused what the reader knew.
 *
 * ⚠️ There is no generated-types import for this: `src/types/generated/api.ts` is regenerated from
 * the backend's openapi.json on its own cadence, and P1 must not wait on that. The test beside this
 * file asserts the two lists match the ones the API documents.
 */
export const CUSTOM_API_CATEGORIES = ['order', 'shipment', 'invoice', 'account'] as const;

export type CustomApiCategory = (typeof CUSTOM_API_CATEGORIES)[number];

/**
 * What an ADMIN sees. Deliberately plain: the picker is answering "what is this thing", and
 * `order` is not a word that needs dressing up.
 */
export const CATEGORY_LABELS: Record<CustomApiCategory, string> = {
  order: 'Orders',
  shipment: 'Shipments or tracking',
  invoice: 'Invoices or payments',
  account: 'Accounts or subscriptions',
};

/** Singular, for a heading over ONE record — "Order", not "Orders". */
export const CATEGORY_RECORD_LABELS: Record<CustomApiCategory, string> = {
  order: 'Order',
  shipment: 'Shipment',
  invoice: 'Invoice',
  account: 'Account',
};

/** The category stored on an endpoint, or null when it is unset or a word this build lacks. */
export const readCategory = (value: unknown): CustomApiCategory | null =>
  typeof value === 'string' && (CUSTOM_API_CATEGORIES as readonly string[]).includes(value)
    ? (value as CustomApiCategory)
    : null;
