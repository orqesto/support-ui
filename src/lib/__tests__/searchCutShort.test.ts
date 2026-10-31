import { describe, expect, it } from 'vitest';
import { searchCutShort } from '@/lib/searchCutShort';

describe('searchCutShort', () => {
  it('is true only when meta.timing.searchCutShort lists a read', () => {
    expect(searchCutShort({ meta: { timing: { searchCutShort: ['kb_vector'] } } })).toBe(true);
  });

  it('CONTROL: an older backend (no meta), an empty list or junk is not a cut', () => {
    expect(searchCutShort({ data: {} })).toBe(false);
    expect(searchCutShort({ meta: { timing: { searchCutShort: [] } } })).toBe(false);
    expect(searchCutShort({ meta: { timing: null } })).toBe(false);
    expect(searchCutShort(null)).toBe(false);
    expect(searchCutShort('x')).toBe(false);
  });
});
