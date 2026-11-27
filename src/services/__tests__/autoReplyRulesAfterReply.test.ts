/**
 * A keyword rule's "After the reply" as the list reads it (owner 2026-11-27): 'resolve' or
 * 'pending'; a row without the field (an older backend) or with a value this bundle does not know
 * reads as 'resolve'. Invented data.
 */
import { describe, expect, it, vi } from 'vitest';

const rows = vi.hoisted(() => ({ data: [] as Record<string, unknown>[] }));

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: () => Promise.resolve({ data: { success: true, data: rows.data } }) },
}));

import { autoReplyRulesService } from '@/services/autoReplyRules.service';

describe('autoReplyRulesService.list — afterReply', () => {
  it.each([
    ['pending', 'pending'],
    ['resolve', 'resolve'],
    [undefined, 'resolve'],
    ['leave_open', 'resolve'],
    [42, 'resolve'],
  ])('%s reads as %s', async (stored, read) => {
    rows.data = [{ id: 1, keywords: ['refund'], replyText: 'See example.com', afterReply: stored }];
    const [rule] = await autoReplyRulesService.list();
    expect(rule.afterReply).toBe(read);
  });
});
