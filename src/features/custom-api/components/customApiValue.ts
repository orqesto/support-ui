import type { LookupField } from '@/features/custom-api/services/customApiLookup.service';

/**
 * One vendor value as text (moved out of `customApiRowFields` in modularity task F2): shared by
 * the row fields, the record note and the insert control without the three importing each other.
 */

/**
 * A vendor value is `unknown` — the shape is whatever that vendor returned, discovered at run time.
 *
 * ⛔ Never `String(value)` on it: a configured path that resolves to an object renders as
 * "[object Object]" in front of an agent, which looks like data and is not.
 */
const asText = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  /*
    A whole list where one value belongs — the preview of a lookup with no fields picked shows the
    vendor's keys as they are, lists included. Plain values read as text; a list of records reads
    as a count, because its JSON (`[{"name":…}]`) is the vendor's data model, not an answer.
  */
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    if (value.every((item) => item === null || typeof item !== 'object'))
      return value.map((item) => asText(item) ?? '—').join(', ');
    return value.length === 1 ? '1 item' : `${value.length} items`;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
};

/**
 * The list a field read through, or null for a plain field: `products[].name` → `products[]`,
 * `products[].option[].value` → `products[].option[]`. Fields with the same list are laid out
 * together, one line per item.
 */
export const listOf = (path: string): string | null => {
  const end = path.lastIndexOf('[]');
  return end === -1 ? null : path.slice(0, end + 2);
};

/**
 * One rendered entry per item, for a field read through a list. The backend returns such a field
 * as an array aligned item for item (a missing value holds a null), and for money a currency array
 * aligned the same way — or one currency, when the admin configured a literal or a plain path.
 * An older backend sends no array at all: that reads as no items, which is what it showed before.
 */
export const renderItems = (row: Record<string, unknown>, field: LookupField): string[] => {
  const values = row[field.path];
  if (!Array.isArray(values)) return [];
  const currencies = row[`${field.path}__currency`];
  return values.map((item, index) => {
    const value = asText(item);
    if (value === null) return '—';
    if (field.kind !== 'money') return value;
    const currency =
      field.currency ?? asText(Array.isArray(currencies) ? currencies[index] : currencies);
    return currency ? `${value} ${currency}` : value;
  });
};

/** D23: a money figure without its currency is a misquote waiting to happen. */
export const renderValue = (row: Record<string, unknown>, field: LookupField): string => {
  // A list field anywhere a single string is needed (the header, the note for the reply): its
  // items in order. ⛔ Never JSON on the array — that prints `["a","b"]` to an agent.
  // Only for a `[]` path: a plain key holding a whole list (the no-fields preview) goes through
  // `asText`, which counts a list of records instead of printing each one as JSON.
  if (listOf(field.path) !== null && Array.isArray(row[field.path])) {
    const items = renderItems(row, field);
    // No item carries a value ⇒ the plain dash, so a header or a note never reads "—, —".
    return items.some((item) => item !== '—') ? items.join(', ') : '—';
  }
  const value = asText(row[field.path]);
  if (value === null) return '—';
  /*
    L2 P2: the admin's word for a vendor status, when they have written one. Same sibling-key
    convention as `__currency` below.

    ⛔ The backend emits this ONLY for a field tagged `status` and only when the value is mapped,
    so an unmapped value falls through and the agent reads what the vendor literally said — which
    is honest, and is what P2's acceptance asks for. The product never invents a word for `3`.
  */
  const statusWord = asText(row[`${field.path}__label`]);
  if (statusWord !== null) return statusWord;
  if (field.kind !== 'money') return value;
  // The currency is either configured as a literal or travels WITH the row, because on a vendor
  // that prices per row the same figure means different currencies from different endpoints.
  const currency = field.currency ?? asText(row[`${field.path}__currency`]);
  return currency ? `${value} ${currency}` : value;
};
