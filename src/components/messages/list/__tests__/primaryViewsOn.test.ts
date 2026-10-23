import { describe, it, expect } from 'vitest';
import { primaryViewsOn } from '../ThreadViews';

describe('primaryViewsOn — one primary pill lit at a time', () => {
  it('Needs us alone on the landing view (no filter counted)', () => {
    expect(primaryViewsOn({ lifecycle: 'needs_us', columnId: 'all' }, 0)).toEqual({
      needsUs: true,
      all: false,
    });
  });

  it('All when nothing narrows the list', () => {
    expect(primaryViewsOn({ lifecycle: 'all', columnId: 'all' }, 0)).toEqual({
      needsUs: false,
      all: true,
    });
  });

  it('neither while another filter is on', () => {
    expect(primaryViewsOn({ lifecycle: 'resolved' }, 1)).toEqual({ needsUs: false, all: false });
  });
});
