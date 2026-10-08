/**
 * FE audit M16 (2026-09-29): a category THIS build does not know — the API gained one before the
 * frontend did — read as "not set", and the next Test or Save sent `category: null`, wiping the
 * admin's choice for a field the screen never showed them. It is now KEPT: offered as its own
 * option, selected, and left out of the write unless the admin picks something else.
 */
import type { Option } from '@/components/ui/Select';
import { readCategory } from './categories';

export const KEEP_CATEGORY = '__keep_stored_category';

/** The write's category field: omitted (keep), null (clear), or the chosen one. */
export const categoryPayload = (value: string): { category?: string | null } =>
  value === KEEP_CATEGORY ? {} : { category: value === '' ? null : value };

/** The stored category when this build has no option for it, else null. */
export const unknownCategoryOf = (stored: string | null | undefined): string | null =>
  stored && !readCategory(stored) ? stored : null;

/** The option that says the stored category is there and will be kept (none when nothing is stored). */
export const keepCategoryOptions = (stored: string | null): Option[] =>
  stored ? [{ value: KEEP_CATEGORY, label: `Keep “${stored}” (set elsewhere)` }] : [];
