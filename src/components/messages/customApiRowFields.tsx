import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { CustomApiRecordInsert } from './CustomApiRecordInsert';
import {
  CATEGORY_RECORD_LABELS,
  type CustomApiCategory,
} from '@/components/settings/customApi/categories';
import { LABEL } from './messageDetailConstants';
import type { AddOutcome } from './recordInsertOutcome';
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

/**
 * How many items of a list the card shows before "Show all". An order of 50 lines would otherwise
 * push everything under it out of the panel.
 */
export const LIST_ITEM_PREVIEW = 10;

/** `products[]` → "PRODUCTS", `products[].option[]` → "OPTION": the list's own name. */
const listTitle = (list: string): string => {
  const last = list.slice(0, -2).split('.').pop() ?? list;
  return last.replace(/\[\]/g, '').replace(/[_-]+/g, ' ').trim().toUpperCase();
};

/**
 * Fields read from one list, one line per item: product, price, quantity together, instead of a
 * column of names and a separate column of prices an agent has to pair up by counting.
 * ⚠️ Items are lined up by position; the backend keeps every field of a list the same length.
 */
const ListGrid = ({
  list,
  row,
  fields,
}: {
  list: string;
  row: Record<string, unknown>;
  fields: LookupField[];
}) => {
  const [showAll, setShowAll] = useState(false);
  const columns = fields.map((field) => renderItems(row, field));
  const total = Math.max(0, ...columns.map((items) => items.length));
  // ⛔ A cut that says so: "and 40 more" with the way to see them, never a silently short list.
  const count = showAll ? total : Math.min(total, LIST_ITEM_PREVIEW);
  return (
    <div className="col-span-2 grid gap-0.5" data-testid="lookup-list">
      <p className={`${LABEL} text-muted-foreground`}>{listTitle(list)}</p>
      {count === 0 ? (
        <p className="text-[11px] text-foreground">—</p>
      ) : (
        <div
          className="grid gap-x-3 gap-y-0.5"
          style={{ gridTemplateColumns: `repeat(${fields.length}, minmax(0, auto))` }}
        >
          {/* A header only when there is more than one column; a lone column is named by the list. */}
          {fields.length > 1 &&
            fields.map((field) => (
              <p key={field.path} className={`${LABEL} text-faint-foreground`}>
                {field.label.toUpperCase()}
              </p>
            ))}
          {Array.from({ length: count }, (_, item) =>
            columns.map((items, column) => (
              <p
                key={`${item}-${fields[column].path}`}
                className="text-[11px] text-foreground break-words"
              >
                {items[item] ?? '—'}
              </p>
            ))
          )}
        </div>
      )}
      {total > count && (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 justify-self-start px-0 text-[11px] text-primary hover:underline"
          onClick={() => setShowAll(true)}
        >
          {`Show all ${total} (${total - count} more)`}
        </Button>
      )}
    </div>
  );
};

/**
 * The labelled grid every lookup has always rendered. The floor P3 never falls below.
 * Fields read from a list are gathered where the list's first field was picked and shown as a
 * `ListGrid`; every other field keeps its own line, in the admin's order.
 */
const FieldGrid = ({ row, fields }: { row: Record<string, unknown>; fields: LookupField[] }) => {
  const seen = new Set<string>();
  return (
    <div className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-0.5">
      {fields.map((field) => {
        const list = listOf(field.path);
        if (list === null)
          return (
            <div key={field.path} className="contents">
              <p className={`${LABEL} text-muted-foreground`}>{field.label.toUpperCase()}</p>
              <p className="text-[11px] text-foreground break-words">{renderValue(row, field)}</p>
            </div>
          );
        if (seen.has(list)) return null;
        seen.add(list);
        const group = fields.filter((other) => listOf(other.path) === list);
        return (
          <ListGrid
            /*
              ⛔ Keyed on the list's VALUES, not only its name: the panel keys rows by index, so a
              new lookup reuses this component — and a "Show all" pressed on the last record
              would open the next one fully expanded.
            */
            key={`${list}:${JSON.stringify(group.map((other) => row[other.path]))}`}
            list={list}
            row={row}
            fields={group}
          />
        );
      })}
    </div>
  );
};

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
    <div className="grid gap-1 border-t border-hair pt-1.5 first:border-t-0 first:pt-0">
      {/* v4 `.k-rt`: what the record is and its reference, then the status pill `.k-st`. */}
      <div className="flex items-center justify-between gap-1.5">
        <p className="text-[12px] font-medium text-foreground break-words">
          {/* The category names the thing; the reference identifies it. With no reference the
              heading still says WHAT this is, which is more than the generic list ever did. */}
          {CATEGORY_RECORD_LABELS[category]}
          {/* A real space, not only the margin: `Order137416` is what a screen reader would
              otherwise announce, and what a copy-paste would carry. */}
          {identifier && (
            <span className="ml-1 font-mono">{` ${renderValue(row, identifier)}`}</span>
          )}
        </p>
        {status && (
          /* The admin's word when they wrote one, the vendor's own value when they did not —
             `renderValue` already decides that, and P2's rule is that we never invent one. */
          <span className="shrink-0 whitespace-nowrap rounded bg-sunken px-1.5 py-px text-[10.5px] text-foreground">
            {renderValue(row, status)}
          </span>
        )}
      </div>

      {meta.length > 0 && (
        // v4 `.k-meta`: "Placed: 11 Sep 2026 · Total: 106.50 PLN".
        <p className="text-[11.5px] text-faint-foreground">
          {meta.map((field, index) => (
            /* Keyed on path AND role: the same path can be configured twice under two roles,
               and a duplicate key silently drops a node in React. */
            <span key={`${field.path}-${roleOf(field) ?? ''}`}>
              {index > 0 && <span className="mx-1.5">·</span>}
              <span>{field.label}: </span>
              <span className="text-foreground [font-variant-numeric:tabular-nums]">
                {renderValue(row, field)}
              </span>
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
  onUseInReply?: (note: string) => AddOutcome;
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
      /*
        ⛔ KEYED ON THE ROW ITSELF (audit pass 6). The panel keys its rows by INDEX, so pressing
        Look up again reuses this component for whatever record now sits in that position — with
        the previous record's ticks still set and its "Added to your note" badge still showing.
        A changed row is a different record and gets a fresh control.
      */
      key={JSON.stringify(row)}
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
