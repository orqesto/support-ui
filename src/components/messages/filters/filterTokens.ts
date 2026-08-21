/**
 * Turning `FilterState` into tokens, and typed text into candidate filters.
 *
 * Kept apart from the components so the matching rules — the part with actual
 * behaviour worth testing — can be exercised without rendering a popover.
 */
import {
  csvValues,
  filterValue,
  isNegated,
  visibleDefs,
  withNegation,
  type FilterDef,
  type FilterOption,
} from './filterSchema';
import { isRangeValue, rangeFromValue, rangeText } from './receivedRange';
import type { FilterState } from '@/stores/messagesStore';

export type Token = {
  def: FilterDef;
  value: string;
  /** Rendered inside the token: the option's label, the flag's name, or the query. */
  text: string;
  dot?: string;
  /** `is not` rather than `is` — rendered by the token's name half. */
  negated?: boolean;
};

const optionOf = (def: FilterDef, value: string): FilterOption | undefined =>
  def.options?.find((opt) => opt.value === value);

const labelOf = (def: FilterDef, value: string): string => optionOf(def, value)?.label ?? value;

/**
 * What a multi-value token reads as.
 *
 * Two labels fit; beyond that the token would push everything else off the line, so the
 * rest becomes a count. "High +2" is still legible as "three of them, one is High" —
 * "high, critical, medium, low" is not legible as anything at this width.
 */
const multiText = (def: FilterDef, values: string[]): string => {
  const labels = values.map((value) => labelOf(def, value));
  if (labels.length <= 2) return labels.join(', ');
  return `${labels[0]} +${labels.length - 1}`;
};

/** What a token reads as. Linked folds its sub-value in: `linked: Has Ticket · Open`. */
export const tokenText = (def: FilterDef, value: string, filters: FilterState): string => {
  if (def.kind === 'flag') return def.label;
  if (def.kind === 'free') return `"${value}"`;
  if (def.kind === 'date') {
    if (!isRangeValue(value)) return labelOf(def, value);
    const { from, to } = rangeFromValue(value);
    return rangeText(from, to);
  }
  if (def.multi) {
    const values = csvValues(value);
    if (values.length > 1) return multiText(def, values);
  }
  const base = labelOf(def, value);
  if (!def.sub) return base;
  const subValue = (filters as Record<string, unknown>)[def.sub.key];
  const subLabel = def.sub.options.find((opt) => opt.value === subValue)?.label;
  return subLabel ? `${base} · ${subLabel}` : base;
};

/** Active filters, in schema order so the bar never reshuffles as you add them. */
export const tokensOf = (
  defs: FilterDef[],
  filters: FilterState,
  isKanban: boolean
): Token[] =>
  visibleDefs(defs, isKanban).flatMap((def) => {
    const value = filterValue(filters, def.key);
    if (value === undefined) return [];
    // One value carries its colour; a set of them has no single colour to show.
    const single = def.multi ? csvValues(value).length === 1 : true;
    return [
      {
        def,
        value,
        text: tokenText(def, value, filters),
        dot: single ? optionOf(def, csvValues(value)[0] ?? value)?.dot : undefined,
        negated: def.negatable ? isNegated(filters, def.key) : false,
      },
    ];
  });

export type Suggestion =
  | { kind: 'free'; query: string }
  /** Open this filter's value list. */
  | { kind: 'filter'; def: FilterDef }
  /** Apply this value directly — typing "spam" reaches `queue: Spam` without
   *  knowing the filter is called Queue. */
  | { kind: 'value'; def: FilterDef; option: FilterOption }
  | { kind: 'flag'; def: FilterDef };

/**
 * Candidates for a query.
 *
 * Values are matched as well as filter names, which is the whole point: the previous
 * panel required you to know that "Spam" lives under a control named "Queue". A blank
 * query returns nothing — the caller shows the browsable list instead.
 */
export const suggestionsFor = (
  defs: FilterDef[],
  query: string,
  isKanban: boolean
): Suggestion[] => {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const out: Suggestion[] = [{ kind: 'free', query: query.trim() }];
  for (const def of visibleDefs(defs, isKanban)) {
    if (def.kind === 'free') continue;
    const nameHit = def.label.toLowerCase().includes(needle);
    if (def.kind === 'flag') {
      if (nameHit) out.push({ kind: 'flag', def });
      continue;
    }
    if (nameHit) out.push({ kind: 'filter', def });
    for (const option of def.options ?? []) {
      if (option.label.toLowerCase().includes(needle)) out.push({ kind: 'value', def, option });
    }
  }
  return out;
};

/** `'all'` is this codebase's "off" for selects; flags clear to `false`. */
export const clearedValue = (def: FilterDef): string | boolean =>
  def.kind === 'flag' ? false : def.kind === 'free' ? '' : 'all';

/**
 * The write that turns one token off.
 *
 * A patch rather than a value because switching a filter off is not always one field:
 * Received is three, and a negated filter has to take its inversion with it. Leaving the
 * `negate` entry behind is inert while the filter is unset and then silently inverts it
 * the next time it is set — the kind of state that looks like the filter is broken.
 */
export const clearPatch = (def: FilterDef, filters: FilterState): Partial<FilterState> => {
  if (def.kind === 'date') {
    return { ageRange: 'all', receivedFrom: undefined, receivedTo: undefined };
  }
  const patch: Record<string, unknown> = { [def.key]: clearedValue(def) };
  if (def.negatable && isNegated(filters, def.key)) {
    patch.negate = withNegation(filters, def.key, false);
  }
  if (def.sub) patch[def.sub.key] = 'all';
  return patch as Partial<FilterState>;
};
