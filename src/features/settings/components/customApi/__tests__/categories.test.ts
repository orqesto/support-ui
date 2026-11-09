/**
 * The frontend's category list must match the backend's.
 *
 * ⛔ The backend REFUSES a word it does not know (400 on save) and reads an unknown stored value
 * as null. So a frontend list that drifts gives an admin an option they can pick and never save —
 * #789's failure with the sides swapped: there the writer refused what the reader offered.
 *
 * 🔑 Checked against the GENERATED types, which come from the backend's own openapi.json. That is
 * the closest thing to the API's word available at test time, and it is regenerated from the
 * backend rather than hand-written here.
 */
import { describe, it, expect } from 'vitest';
import type { components } from '@/types/generated/api';
import {
  CATEGORY_LABELS,
  CATEGORY_RECORD_LABELS,
  CUSTOM_API_CATEGORIES,
  readCategory,
} from '../categories';

type ApiCategory = NonNullable<components['schemas']['CustomApiEndpoint']['category']>;

describe('the L2 category list', () => {
  it('matches the categories the API documents', () => {
    // A compile-time check as well as a runtime one: if the API drops or renames a category, the
    // assignment below stops type-checking and this list stops matching.
    const fromApi: ApiCategory[] = [...CUSTOM_API_CATEGORIES];
    expect([...fromApi].sort()).toEqual(['account', 'invoice', 'order', 'shipment']);
  });

  it('has a label for every category, in both forms', () => {
    // A missing label renders `undefined` in a picker — visible, unexplained, and unpickable.
    for (const category of CUSTOM_API_CATEGORIES) {
      expect(CATEGORY_LABELS[category]).toBeTruthy();
      expect(CATEGORY_RECORD_LABELS[category]).toBeTruthy();
    }
  });

  it('🔴 readCategory rejects a word this build does not know', () => {
    // A newer backend, or a hand-edited row. It must degrade to "no category" rather than reach a
    // label lookup that returns undefined.
    expect(readCategory('parcel')).toBeNull();
    expect(readCategory('')).toBeNull();
    expect(readCategory(null)).toBeNull();
    expect(readCategory(undefined)).toBeNull();
    expect(readCategory(42)).toBeNull();
  });

  it('CONTROL: readCategory passes through the ones it knows', () => {
    // Without this, a function that returned null unconditionally would satisfy the test above and
    // the category would never render anywhere.
    for (const category of CUSTOM_API_CATEGORIES) {
      expect(readCategory(category)).toBe(category);
    }
  });
});
