import { CATEGORY_TAB_LABELS, readCategory } from '@/components/settings/customApi/categories';

export const LOOKUPS_TAB_FALLBACK = 'Lookups';

/**
 * The lookups tab's name (owner, 2026-10-09): the category's plural when EVERY lookup this caller
 * can run here declares the same one, otherwise "Lookups". Admin-declared data only — never
 * inferred. Unknown words, nulls, a missing field (older backend) and "not loaded" all fall back.
 */
export function lookupTabLabel(options: readonly { category?: unknown }[] | null): string {
  if (!options || options.length === 0) return LOOKUPS_TAB_FALLBACK;
  const first = readCategory(options[0].category);
  if (!first) return LOOKUPS_TAB_FALLBACK;
  return options.every((option) => readCategory(option.category) === first)
    ? CATEGORY_TAB_LABELS[first]
    : LOOKUPS_TAB_FALLBACK;
}
