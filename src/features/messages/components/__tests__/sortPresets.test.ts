import { describe, it, expect } from 'vitest';
import { SORT_PRESET_OPTIONS, presetToSorting, sortingToPreset } from '../sortPresets';

describe('sortPresets — directional reply recency', () => {
  it('exposes the two directional options in the dropdown', () => {
    const values = SORT_PRESET_OPTIONS.map((opt) => opt.value);
    expect(values).toContain('last_client_reply');
    expect(values).toContain('last_our_reply');
  });

  it('maps preset → sorting for each direction (most recent first)', () => {
    expect(presetToSorting('last_client_reply')).toEqual({ sortBy: 'last_client_reply', sortOrder: 'desc' });
    expect(presetToSorting('last_our_reply')).toEqual({ sortBy: 'last_our_reply', sortOrder: 'desc' });
  });

  it('round-trips sorting ↔ preset for each direction', () => {
    for (const value of ['last_client_reply', 'last_our_reply'] as const) {
      expect(sortingToPreset(presetToSorting(value))).toBe(value);
    }
  });
});
