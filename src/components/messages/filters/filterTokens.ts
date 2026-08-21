/**
 * Turning `FilterState` into tokens, and typed text into candidate filters.
 *
 * Kept apart from the components so the matching rules — the part with actual
 * behaviour worth testing — can be exercised without rendering a popover.
 */
import {
  filterValue,
  visibleDefs,
  type FilterDef,
  type FilterOption,
} from './filterSchema';
import type { FilterState } from '@/stores/messagesStore';

export type Token = {
  def: FilterDef;
  value: string;
  /** Rendered inside the token: the option's label, the flag's name, or the query. */
  text: string;
  dot?: string;
};

const optionOf = (def: FilterDef, value: string): FilterOption | undefined =>
  def.options?.find((opt) => opt.value === value);

/** What a token reads as. Linked folds its sub-value in: `linked: Has Ticket · Open`. */
export const tokenText = (def: FilterDef, value: string, filters: FilterState): string => {
  if (def.kind === 'flag') return def.label;
  if (def.kind === 'free') return `"${value}"`;
  const base = optionOf(def, value)?.label ?? value;
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
    return [
      {
        def,
        value,
        text: tokenText(def, value, filters),
        dot: optionOf(def, value)?.dot,
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
