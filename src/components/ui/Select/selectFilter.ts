import type { FilterOptionOption } from 'react-select';
import type { Option } from './select.types';

/**
 * Type-to-filter on what the user can SEE — the label (and the menu label) — never the value.
 * react-select's default also matches `value`, and most of ours are database ids: typing "12"
 * offered every label whose id contains 12. The create row of a creatable select passes through
 * (its label is `Create "<text>"`, which contains the text).
 */
export const matchesLabel = (candidate: FilterOptionOption<Option>, input: string): boolean => {
  const needle = input.trim().toLowerCase();
  if (!needle) return true;
  const data = candidate.data as Option & { __isNew__?: boolean };
  if (data.__isNew__) return true;
  return [candidate.label, data.menuLabel ?? '']
    .some((text) => text.toLowerCase().includes(needle));
};
