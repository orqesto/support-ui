import { CATEGORY_TAB_LABELS, readCategory } from '@/components/settings/customApi/categories';
import {
  useCustomApiLookupAvailability,
  useCustomApiLookupOptions,
  useCustomApiLookupOptionsSettled,
} from '@/hooks/useCustomApiLookup';
import type { LookupSurface } from '@/services/customApiLookup.service';

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

/**
 * Everything a host needs to render the lookups tab for one surface: whether to show it at all
 * (availability — fails closed — AND the options answered, so the name never changes after it
 * appears), the badge number and the name. Shared by message details
 * (`thread`) and the contact drawer (`contact`).
 */
export function useLookupsTab(surface: LookupSurface): {
  available: boolean;
  count: number;
  label: string;
} {
  const availableHere = useCustomApiLookupAvailability(surface);
  const settled = useCustomApiLookupOptionsSettled(surface);
  const options = useCustomApiLookupOptions(surface);
  return {
    available: availableHere && settled,
    count: options?.length ?? 0,
    label: lookupTabLabel(options),
  };
}
