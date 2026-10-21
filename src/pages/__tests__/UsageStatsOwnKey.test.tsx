/**
 * AI calls are a statistic only: Usage Stats shows the count with no allowance, no overage and no
 * percentage — on the platform key and on an own key alike (Free, own key required, used to show
 * every call as "overage").
 */
import { describe, expect, it } from 'vitest';
import { usageRowsFrom, type RawUsage } from '../usageStatsRows';

const raw = (applies: boolean | undefined): RawUsage => ({
  aiCalls: { current: 340, limit: 96000, overage: 340, percentage: 0, appliesToThisWorkspace: applies },
  messages: { current: 10, limit: 1500, percentage: 1 },
});

describe('Usage Stats rows — AI calls are a count', () => {
  it('own key: names the key, no included, no overage', () => {
    const [ai] = usageRowsFrom(raw(false));
    expect(ai.displayName).toMatch(/own AI key/);
    expect(ai).toMatchObject({ included: 0, overage: 0, current: 340 });
  });

  it('platform key: still a count with no limit, even if an older backend sends one', () => {
    const [ai] = usageRowsFrom(raw(true));
    expect(ai.displayName).toMatch(/a count, no limit/);
    expect(ai).toMatchObject({ included: 0, overage: 0, current: 340 });
  });

  it('messages use the limit the backend sends (packs included) and say AI is included', () => {
    expect(usageRowsFrom(raw(true))[1]).toMatchObject({
      displayName: 'Messages (AI included)',
      included: 1500,
      overage: 0,
    });
  });
});
