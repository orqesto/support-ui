/**
 * A keyword rule's "Holding reply" as the list reads it (owner 2026-11-27): only `true` is on; a
 * row without the field (an older backend) or with any other value reads as off. Invented data.
 */
import { describe, expect, it, vi } from 'vitest';

const rows = vi.hoisted(() => ({ data: [] as Record<string, unknown>[] }));

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: () => Promise.resolve({ data: { success: true, data: rows.data } }) },
}));

import { autoReplyRulesService } from '@/services/autoReplyRules.service';

describe('autoReplyRulesService.list — holdingReply', () => {
  it.each([
    [true, true],
    [false, false],
    [undefined, false],
    ['true', false],
    [1, false],
    [null, false],
  ])('%s reads as %s', async (stored, read) => {
    rows.data = [
      { id: 1, keywords: ['refund'], replyText: 'See example.com', holdingReply: stored },
    ];
    const [rule] = await autoReplyRulesService.list();
    expect(rule.holdingReply).toBe(read);
  });
});
