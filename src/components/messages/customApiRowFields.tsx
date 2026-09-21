import { LABEL } from './messageDetailConstants';
import type { CustomApiLookupResult, LookupField } from '@/services/customApiLookup.service';

/**
 * Rendering ONE vendor row as labelled fields — shared by the thread panel and the customer
 * records page.
 *
 * ⛔ SHARED ON PURPOSE. The records page is opened FROM the panel, and a page that renamed,
 * recoloured or flattened what that panel said would make an agent doubt which one is true. The
 * page previously rendered raw JSON where the panel rendered fields; this is the fix, and keeping
 * one implementation is what stops them drifting again.
 */

/**
 * How many fields to preview when an admin has chosen none. Small on purpose: the alternative is
 * the vendor's whole record, PII included, on screen.
 *
 * 🔴 The history, because the number looks arbitrary and is not. When no fields are configured —
 * the DEFAULT state — the backend returns rows UNPROJECTED. On the measured vendor that is 77
 * fields including the customer's email, telephone, both addresses, postcode, IP and user-agent.
 * One audit pass replaced a blank card with a fallback; the next found the fallback dumping all of
 * it into the thread view.
 */
export const UNCONFIGURED_FIELD_PREVIEW = 6;

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
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
};

/** D23: a money figure without its currency is a misquote waiting to happen. */
export const renderValue = (row: Record<string, unknown>, field: LookupField): string => {
  const value = asText(row[field.path]);
  if (value === null) return '—';
  if (field.kind !== 'money') return value;
  // The currency is either configured as a literal or travels WITH the row, because on a vendor
  // that prices per row the same figure means different currencies from different endpoints.
  const currency = field.currency ?? asText(row[`${field.path}__currency`]);
  return currency ? `${value} ${currency}` : value;
};

/**
 * Which fields to show for a result, and whether we are falling back to the row's own keys.
 *
 * ⛔ FALL BACK TO THE ROW'S KEYS. `fieldPaths` DEFAULTS to empty and the backend then returns rows
 * unprojected, so mapping over `fields` alone renders a BLANK card while holding data — on the
 * commonest configuration state there is. The `__currency` companions are the projection's own
 * bookkeeping, not vendor fields.
 */
export const projectFields = (
  result: CustomApiLookupResult
): { fields: LookupField[]; fallbackKeys: string[]; usingFallback: boolean } => {
  const fallbackKeys = Object.keys(result.rows?.[0] ?? {}).filter(
    (key) => !key.endsWith('__currency')
  );
  const usingFallback = !result.fields?.length;
  return {
    fallbackKeys,
    usingFallback,
    fields: usingFallback
      ? fallbackKeys
          .slice(0, UNCONFIGURED_FIELD_PREVIEW)
          .map((key) => ({ path: key, label: key, kind: 'plain' as const }))
      : (result.fields ?? []),
  };
};

export const RowFields = ({
  row,
  fields,
}: {
  row: Record<string, unknown>;
  fields: LookupField[];
}) => (
  <div className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-0.5">
    {fields.map((field) => (
      <div key={field.path} className="contents">
        <p className={`${LABEL} text-muted-foreground`}>{field.label.toUpperCase()}</p>
        <p className="text-[11px] text-foreground break-words">{renderValue(row, field)}</p>
      </div>
    ))}
  </div>
);
