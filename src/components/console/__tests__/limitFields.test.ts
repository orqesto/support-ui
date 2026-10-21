import { describe, expect, it } from 'vitest';
import { LIMIT_FIELDS, formatLimit, parseLimitDraft, draftFromLimits } from '../limitFields';

describe('limitFields', () => {
  it('covers every limit the backend accepts (LIMIT_KEYS in limitService.ts)', () => {
    expect(LIMIT_FIELDS.map((field) => field.key).sort()).toEqual(
      [
        'maxAICallsPerMonth',
        'maxAutoRepliesPerMonth',
        'maxDepartments',
        'maxHistoryDays',
        'maxHistoryMessages',
        'maxIntegrations',
        'maxKbItems',
        'maxMessagesPerMonth',
        'maxOrganizations',
        'maxStorageMb',
        'maxStoredMessages',
        'maxUsers',
      ].sort()
    );
  });

  it('parses filled fields, leaves blanks out, rejects negatives and fractions by name', () => {
    expect(parseLimitDraft({ maxUsers: '5', maxStorageMb: ' ', maxAutoRepliesPerMonth: '500' })).toEqual({
      ok: true,
      limits: { maxUsers: 5, maxAutoRepliesPerMonth: 500 },
    });
    expect(parseLimitDraft({ maxUsers: '-1', maxKbItems: '1.5' })).toEqual({
      ok: false,
      invalid: ['maxUsers', 'maxKbItems'],
    });
  });

  it('round-trips a plan and shows 999999 as Unlimited', () => {
    expect(draftFromLimits({ maxUsers: 5 }).maxUsers).toBe('5');
    expect(draftFromLimits({ maxUsers: 5 }).maxKbItems).toBe('');
    expect(formatLimit(999999)).toBe('Unlimited');
    expect(formatLimit(1200)).toBe((1200).toLocaleString());
    expect(formatLimit(null)).toBe('—');
  });
});
