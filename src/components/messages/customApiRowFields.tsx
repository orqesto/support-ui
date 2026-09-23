import type { ReactNode } from 'react';
import { CustomApiRecordInsert } from './CustomApiRecordInsert';
import { CATEGORY_RECORD_LABELS, type CustomApiCategory } from '@/components/settings/customApi/categories';
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
    // ⛔ `__label` joins `__currency` here. Both are the projection's own bookkeeping; rendering
    // one as a vendor field would show an agent a column called `status__label`.
    (key) => !key.endsWith('__currency') && !key.endsWith('__label')
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

/** The labelled grid every lookup has always rendered. The floor P3 never falls below. */
const FieldGrid = ({ row, fields }: { row: Record<string, unknown>; fields: LookupField[] }) => (
  <div className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-0.5">
    {fields.map((field) => (
      <div key={field.path} className="contents">
        <p className={`${LABEL} text-muted-foreground`}>{field.label.toUpperCase()}</p>
        <p className="text-[11px] text-foreground break-words">{renderValue(row, field)}</p>
      </div>
    ))}
  </div>
);

/** A value that is actually there. `renderValue` returns this dash for absent, null or empty. */
const MISSING = '—';

/**
 * What the admin tagged this field as, or null.
 *
 * ⚠️ READ OFF AN `unknown`, not typed. `src/types/generated/api.ts` is regenerated from the
 * backend's openapi.json on its own cadence, so it does not carry `role` until that lands — and
 * this frontend ships from `main` while the backend ships on a tag, so it will meet responses
 * without it either way. Same treatment `category` already gets, for the same reason: an absent
 * role reads as "untagged" and the plain grid renders, never a crash.
 */
const roleOf = (field: LookupField): string | null => {
  const value = (field as { role?: unknown }).role;
  return typeof value === 'string' ? value : null;
};

/**
 * L2 P3 — an order laid out AS an order.
 *
 * ⛔ THE ONLY SOURCE IS THE ADMIN'S OWN ROLES. The backend sends `role` on each field descriptor
 * (`identifier` / `status` / `date` / `total`); nothing here guesses from a label, a path name or
 * a value's shape. A layout that decided `total` was the order number because it looked like one
 * is worse than the generic list it replaces, and it would be wrong silently.
 *
 * ⛔ NOTHING IS EVER DROPPED. The header takes a role field only when that field HAS a value on
 * this row; everything else — unroled fields, and a role field whose value is missing — falls
 * through to the same grid as before, where it still reads `STATUS —`. So the card can only ever
 * re-arrange what the plain list already showed, never hide part of it.
 */
const RecordCard = ({
  row,
  fields,
  category,
  children,
}: {
  row: Record<string, unknown>;
  fields: LookupField[];
  category: CustomApiCategory;
  children?: ReactNode;
}) => {
  const present = (role: string): LookupField | undefined =>
    fields.find((field) => roleOf(field) === role && renderValue(row, field) !== MISSING);

  const identifier = present('identifier');
  const status = present('status');
  const date = present('date');
  const total = present('total');
  /** The date and total line, in that order, with whichever of the two this row actually has. */
  const meta = [date, total].filter((field): field is LookupField => field !== undefined);
  const headed = [identifier, status, ...meta].filter(Boolean);
  const rest = fields.filter((field) => !headed.includes(field));

  return (
    /*
      ⛔ A RULE BETWEEN RECORDS. A `many` lookup can return 25 of these, and once each row has a
      heading and a meta line, consecutive records run together into one wall of text — the reader
      cannot tell where one order ends. `first:` keeps a single record, the common case, exactly as
      it looks today. The plain grid path is untouched: it never gained a heading to be confused by.
    */
    <div className="space-y-1 border-t border-border/60 pt-1.5 first:border-t-0 first:pt-0">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-medium text-foreground break-words">
          {/* The category names the thing; the reference identifies it. With no reference the
              heading still says WHAT this is, which is more than the generic list ever did. */}
          {CATEGORY_RECORD_LABELS[category]}
          {/* A real space, not only the margin: `Order137416` is what a screen reader would
              otherwise announce, and what a copy-paste would carry. */}
          {identifier && <span className="ml-1 font-mono">{` ${renderValue(row, identifier)}`}</span>}
        </p>
        {status && (
          /* The admin's word when they wrote one, the vendor's own value when they did not —
             `renderValue` already decides that, and P2's rule is that we never invent one. */
          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-foreground">
            {renderValue(row, status)}
          </span>
        )}
      </div>

      {meta.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {meta.map((field, index) => (
            /* Keyed on path AND role: the same path can be configured twice under two roles,
               and a duplicate key silently drops a node in React. */
            <span key={`${field.path}-${roleOf(field) ?? ''}`}>
              {index > 0 && <span className="mx-1.5">·</span>}
              <span className="text-muted-foreground">{field.label}: </span>
              <span className="text-foreground">{renderValue(row, field)}</span>
            </span>
          ))}
        </p>
      )}

      {rest.length > 0 && <FieldGrid row={row} fields={rest} />}
      {children}
    </div>
  );
};

/**
 * One vendor row.
 *
 * ⚠️ `category` is optional and defaults to the plain grid: every L1 lookup has none, an older
 * backend sends none, and an admin who has not picked one gets exactly what they had before P3.
 */
export const RowFields = ({
  row,
  fields,
  category = null,
  lookupLabel = '',
  ownership,
  onUseInReply,
}: {
  row: Record<string, unknown>;
  fields: LookupField[];
  category?: CustomApiCategory | null;
  /** L2 P4: what the admin called this lookup, used when there is no category to name. */
  lookupLabel?: string;
  /** D38: carried to the insert control, which is where it matters most. */
  ownership?: 'owned' | 'mismatch' | 'unverified';
  /**
   * L2 P4: add this record to the agent's note for the AI draft. Absent on surfaces with no
   * composer — the customer records page is a page, not a reply — and the control then does not
   * render at all rather than rendering something that cannot work.
   */
  onUseInReply?: (note: string) => 'added' | 'duplicate' | 'full';
}) => {
  // No category, or no role the header can use ⇒ nothing to lay out. The grid is not a degraded
  // mode here, it is the correct rendering of a record nobody has described.
  const hasHeadableRole = fields.some(
    (field) =>
      (roleOf(field) === 'identifier' || roleOf(field) === 'status') &&
      renderValue(row, field) !== MISSING
  );
  const insert = onUseInReply ? (
    <CustomApiRecordInsert
      row={row}
      fields={fields}
      category={category}
      lookupLabel={lookupLabel}
      ownership={ownership}
      onUseInReply={onUseInReply}
    />
  ) : null;

  if (!category || !hasHeadableRole)
    return (
      <div>
        <FieldGrid row={row} fields={fields} />
        {insert}
      </div>
    );
  return (
    <RecordCard row={row} fields={fields} category={category}>
      {insert}
    </RecordCard>
  );
};
