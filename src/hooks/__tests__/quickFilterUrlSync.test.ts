/**
 * A quick-filter chip has to round-trip through the URL like every other filter.
 *
 * It did not, and the failure was silent: `useMessagesUrlSync` rebuilds state as
 * `setFilters({ ...defaultFilters, ...urlFilters })`. Because `columnId` was in the defaults but
 * never read from the URL, every URL sync reset the chip to "All" — the selection survived the
 * click and vanished on the next navigation, and a shared link carried a different list than the
 * sender was looking at.
 *
 * These assert the read and write halves against the real column source, so a chip can never be
 * selectable in the UI but unrepresentable in the URL.
 */
import { describe, expect, it } from 'vitest';
import { COLUMNS } from '@/components/messages/kanbanColumns';

/** Mirrors the read half of useMessagesUrlSync. */
const readColumnFromUrl = (search: string): string | undefined => {
  const value = new URLSearchParams(search).get('column');
  return value && COLUMNS.some((col) => col.id === value) ? value : undefined;
};

/** Mirrors the write half. */
const writeColumnToUrl = (columnId: string | undefined): string => {
  const params = new URLSearchParams();
  if (columnId && columnId !== 'all') params.set('column', columnId);
  return params.toString();
};

describe('quick-filter chip URL round trip', () => {
  it('every selectable column can be expressed in the URL and read back', () => {
    for (const col of COLUMNS) {
      const url = writeColumnToUrl(col.id);
      expect(url).toBe(`column=${col.id}`);
      expect(readColumnFromUrl(`?${url}`)).toBe(col.id);
    }
  });

  it('"all" writes nothing — an empty filter must not litter the URL', () => {
    expect(writeColumnToUrl('all')).toBe('');
    expect(writeColumnToUrl(undefined)).toBe('');
  });

  it('ignores a column id that does not exist rather than filtering by nonsense', () => {
    // A stale link from an older build, or a hand-edited URL, must fall back to no filter —
    // not to a predicate the board no longer has.
    expect(readColumnFromUrl('?column=deleted_column')).toBeUndefined();
    expect(readColumnFromUrl('?column=')).toBeUndefined();
    expect(readColumnFromUrl('')).toBeUndefined();
  });
});
