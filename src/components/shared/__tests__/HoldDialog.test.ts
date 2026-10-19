import { describe, it, expect } from 'vitest';
import { holdUntilFor } from '@/components/shared/HoldDialog';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date(2026, 9, 19, 14, 30);

describe('holdUntilFor', () => {
  it('presets count from now: 1 day, 3 days, 1 week', () => {
    expect(holdUntilFor('1d', '', now)?.getTime()).toBe(now.getTime() + DAY);
    expect(holdUntilFor('3d', '', now)?.getTime()).toBe(now.getTime() + 3 * DAY);
    expect(holdUntilFor('1w', '', now)?.getTime()).toBe(now.getTime() + 7 * DAY);
  });

  it('a picked date means 9:00 that morning', () => {
    expect(holdUntilFor('custom', '2026-10-25', now)).toEqual(new Date(2026, 9, 25, 9, 0));
  });

  it('a picked date that is missing, today-or-earlier or over a year out is no date', () => {
    expect(holdUntilFor('custom', '', now)).toBeNull();
    expect(holdUntilFor('custom', '2026-10-19', now)).toBeNull(); // 9:00 today has passed
    expect(holdUntilFor('custom', '2026-10-01', now)).toBeNull();
    expect(holdUntilFor('custom', '2028-01-01', now)).toBeNull();
    // CONTROL: tomorrow is fine.
    expect(holdUntilFor('custom', '2026-10-20', now)).not.toBeNull();
  });
});
