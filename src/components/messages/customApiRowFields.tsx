import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { CustomApiRecordInsert } from './CustomApiRecordInsert';
import {
  CATEGORY_RECORD_LABELS,
  type CustomApiCategory,
} from '@/components/settings/customApi/categories';
import { listOf, renderItems, renderValue } from './customApiValue';
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

// `listOf`, `renderItems` and `renderValue` live in `./customApiValue` (modularity task F2), so
// CustomApiRecordInsert can use them without importing this file, which renders it. Re-exported
// for existing importers.
export { listOf, renderItems, renderValue };

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

const WEB_ADDRESS = /^https?:\/\/\S+$/i;

/** One http(s) address the browser can open. ⛔ Parsed here, not only matched: `ExternalLink`
 *  renders NOTHING for an address it cannot parse, and a vendor value must never vanish. */
const isWebAddress = (text: string): boolean => {
  if (!WEB_ADDRESS.test(text)) return false;
  try {
    return ['http:', 'https:'].includes(new URL(text).protocol);
  } catch {
    return false;
  }
};

/**
 * A value as text — or, when it is one web address (a carrier's tracking page), a link that opens
 * in a new tab, so an agent does not copy it out by hand.
 */
const FieldValue = ({ text }: { text: string }) =>
  isWebAddress(text) ? (
    <ExternalLink href={text} size="sm" showIcon={false} className="inline break-all text-[11px]">
      {text}
    </ExternalLink>
  ) : (
    <>{text}</>
  );

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
                <FieldValue text={items[item] ?? '—'} />
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
  /*
    ⛔ THE ONE EXCEPTION TO "NOTHING IS EVER DROPPED": a tracking-tagged field with no value. An
    order not yet shipped has no parcel, and that is its normal state, not missing data — a
    "TRACKING —" line on every unshipped order is noise (owner, 2026-10-29: show it only when it
    exists). A list read for tracking (`trackings[]`) goes with its tracking fields: its carrier
    alone, with no parcel to belong to, says nothing either.
  */
  const isEmptyTracking = (group: LookupField[]): boolean => {
    const tracking = group.filter((field) => TRACKING_ROLES.includes(roleOf(field) ?? ''));
    return tracking.length > 0 && tracking.every((field) => valuesOf(row, field).length === 0);
  };
  return (
    // `minmax(0,1fr)`, not `1fr`: a plain `1fr` track is at least as wide as its longest unbroken
    // value, which widened the card past a phone screen (2026-10-14).
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-0.5">
      {fields.map((field) => {
        const list = listOf(field.path);
        if (list === null && isEmptyTracking([field])) return null;
        if (list === null)
          return (
            <div key={field.path} className="contents">
              <p className={`${LABEL} text-muted-foreground`}>{field.label.toUpperCase()}</p>
              <p className="text-[11px] text-foreground break-words">
                <FieldValue text={renderValue(row, field)} />
              </p>
            </div>
          );
        if (seen.has(list)) return null;
        seen.add(list);
        const group = fields.filter((other) => listOf(other.path) === list);
        if (isEmptyTracking(group)) return null;
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

/** The roles that name a parcel. A field tagged with one is hidden while it has no value. */
const TRACKING_ROLES: readonly string[] = ['tracking_number', 'tracking_link'];

/** One parcel: its number, its carrier page, or both. */
export type TrackingItem = { number: string | null; link: string | null };

/** A field's values on this row, one per item for a list field; none when the vendor left it empty. */
const valuesOf = (row: Record<string, unknown>, field: LookupField | undefined): string[] => {
  if (!field) return [];
  if (listOf(field.path) !== null && Array.isArray(row[field.path]))
    return renderItems(row, field).filter((item) => item !== MISSING);
  const value = renderValue(row, field);
  return value === MISSING ? [] : [value];
};

/**
 * The parcels a record names, read ONLY off the admin's `tracking_number` / `tracking_link` tags.
 * Numbers and links are paired by position when there are as many of each (one parcel each, or
 * the same list); otherwise neither is guessed onto the other and both are listed as they are.
 */
export const trackingOf = (row: Record<string, unknown>, fields: LookupField[]): TrackingItem[] => {
  const numberField = fields.find((field) => roleOf(field) === 'tracking_number');
  const linkField = fields.find((field) => roleOf(field) === 'tracking_link');
  const list = numberField && listOf(numberField.path);
  /*
    ⛔ ONE LIST ⇒ PAIRED ITEM BY ITEM, BEFORE anything empty is dropped. Dropping first let a parcel
    with no link shift every later link onto the wrong number.
  */
  if (linkField && list && list === listOf(linkField.path)) {
    const links = renderItems(row, linkField);
    return renderItems(row, numberField)
      .map((number, index) => ({
        number: number === MISSING ? null : number,
        link: (links[index] ?? MISSING) === MISSING ? null : links[index],
      }))
      .filter((item) => item.number !== null || item.link !== null);
  }
  const numbers = valuesOf(row, numberField);
  const links = valuesOf(row, linkField);
  if (numbers.length === links.length)
    return numbers.map((number, index) => ({ number, link: links[index] }));
  return [
    ...numbers.map((number) => ({ number, link: null })),
    ...links.map((link) => ({ number: null, link })),
  ];
};

/** The record's own reference (its `identifier`-tagged value), or null when it has none. */
export const referenceOf = (row: Record<string, unknown>, fields: LookupField[]): string | null => {
  const field = fields.find(
    (one) => roleOf(one) === 'identifier' && renderValue(row, one) !== MISSING
  );
  return field ? renderValue(row, field) : null;
};

/** A parcel number that opens its carrier page in a new tab; a lone link or number as it is. */
const TrackingValue = ({ item }: { item: TrackingItem }) => {
  if (item.link && isWebAddress(item.link))
    return (
      <ExternalLink
        href={item.link}
        size="sm"
        showIcon={false}
        className="inline break-all font-mono text-[11.5px]"
      >
        {item.number ?? item.link}
      </ExternalLink>
    );
  return <span className="font-mono text-foreground break-all">{item.number ?? item.link}</span>;
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
 * re-arrange what the plain list already showed, never hide part of it — with ONE exception, a
 * tracking field with no value (see `FieldGrid`).
 */
const RecordCard = ({
  row,
  fields,
  category,
  onOpenRecord,
  tracking = [],
  children,
}: {
  row: Record<string, unknown>;
  fields: LookupField[];
  category: CustomApiCategory;
  onOpenRecord?: (reference: string) => void;
  tracking?: TrackingItem[];
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
  /** The record's own tracking when it carries any; otherwise what its opened details said. */
  const ownTracking = trackingOf(row, fields);
  const shownTracking = ownTracking.length > 0 ? ownTracking : tracking;
  const trackingFields =
    ownTracking.length > 0
      ? fields.filter(
          (field) => roleOf(field) === 'tracking_number' || roleOf(field) === 'tracking_link'
        )
      : [];
  const headed = [identifier, status, ...meta, ...trackingFields].filter(Boolean);
  const rest = fields.filter((field) => !headed.includes(field));

  return (
    /*
      ⛔ A RULE BETWEEN RECORDS. A `many` lookup can return 25 of these, and once each row has a
      heading and a meta line, consecutive records run together into one wall of text — the reader
      cannot tell where one order ends. `first:` keeps a single record, the common case, exactly as
      it looks today. The plain grid path is untouched: it never gained a heading to be confused by.
    */
    <div className="grid grid-cols-[minmax(0,1fr)] gap-1 border-t border-hair pt-1.5 first:border-t-0 first:pt-0">
      {/* v4 `.k-rt`: what the record is and its reference, then the status pill `.k-st`. */}
      <div className="flex items-center justify-between gap-1.5">
        <p className="min-w-0 text-[12px] font-medium text-foreground break-words">
          {/* The category names the thing; the reference identifies it. With no reference the
              heading still says WHAT this is, which is more than the generic list ever did. */}
          {CATEGORY_RECORD_LABELS[category]}
          {/* A real space, not only the margin: `Order137416` is what a screen reader would
              otherwise announce, and what a copy-paste would carry. */}
          {identifier &&
            (onOpenRecord ? (
              <>
                {' '}
                {/* Opens this record in the lookup that shows ONE record in full (the order's
                    details), so its tracking is a click away from the list. */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-1 h-auto p-0 font-mono text-[12px] font-medium text-primary hover:bg-transparent hover:underline"
                  aria-label={`Show details of ${CATEGORY_RECORD_LABELS[category]} ${renderValue(row, identifier)}`}
                  onClick={() => onOpenRecord(renderValue(row, identifier))}
                >
                  {renderValue(row, identifier)}
                </Button>
              </>
            ) : (
              <span className="ml-1 font-mono">{` ${renderValue(row, identifier)}`}</span>
            ))}
        </p>
        {status && (
          /* The admin's word when they wrote one, the vendor's own value when they did not —
             `renderValue` already decides that, and P2's rule is that we never invent one.
             ⛔ 390 px (staging, 2026-10-14): this was `shrink-0 whitespace-nowrap`, so a long
             vendor status pushed the row past the card and the screen cut it off. A short status
             still fits on one line; a long one wraps inside its capped width. */
          <span className="min-w-0 max-w-[60%] break-words text-right rounded bg-sunken px-1.5 py-px text-[10.5px] text-foreground">
            {renderValue(row, status)}
          </span>
        )}
      </div>

      {meta.length > 0 && (
        // v4 `.k-meta`: "Placed: 11 Sep 2026 · Total: 106.50 PLN".
        <p className="text-[11.5px] text-faint-foreground break-words">
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

      {shownTracking.length > 0 && (
        <p
          className="text-[11.5px] text-faint-foreground break-words"
          data-testid="record-tracking"
        >
          <span>Tracking: </span>
          {shownTracking.map((item, index) => (
            <span key={`${item.number ?? ''}|${item.link ?? ''}`}>
              {index > 0 && ', '}
              <TrackingValue item={item} />
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
  onOpenRecord,
  trackingFor,
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
  /** Open this record, by its reference, in the lookup that shows one record in full. */
  onOpenRecord?: (reference: string) => void;
  /** The parcels already read for a record, by its reference (from its opened details). */
  trackingFor?: (reference: string) => TrackingItem[] | undefined;
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
  const reference = referenceOf(row, fields);
  return (
    <RecordCard
      row={row}
      fields={fields}
      category={category}
      onOpenRecord={onOpenRecord}
      tracking={reference === null ? undefined : trackingFor?.(reference)}
    >
      {insert}
    </RecordCard>
  );
};
