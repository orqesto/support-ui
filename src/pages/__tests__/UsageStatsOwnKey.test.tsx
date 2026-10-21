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

describe('Usage Stats rows - after the budgets are applied, AI calls are a count', () => {
  it('own key: names the key, no included, no overage', () => {
    const [ai] = usageRowsFrom(raw(false), true);
    expect(ai.displayName).toMatch(/own AI key/);
    expect(ai).toMatchObject({ included: 0, overage: 0, current: 340 });
  });

  it('platform key: still a count with no limit, even if an older backend sends one', () => {
    const [ai] = usageRowsFrom(raw(true), true);
    expect(ai.displayName).toMatch(/a count, no limit/);
    expect(ai).toMatchObject({ included: 0, overage: 0, current: 340 });
  });

  it('messages use the limit the backend sends (packs included) and say AI is included', () => {
    expect(usageRowsFrom(raw(true), true)[1]).toMatchObject({
      displayName: 'Messages (AI included)',
      included: 1500,
      overage: 0,
    });
  });
});

describe('Usage Stats rows - before Apply the old monthly AI-call cap still refuses work', () => {
  it('platform key: keeps its limit and overage, never says "no limit"', () => {
    const [ai, messages] = usageRowsFrom(raw(true), false);
    expect(ai).toMatchObject({ displayName: 'AI Calls', included: 96000, overage: 340, current: 340 });
    expect(ai.displayName).not.toMatch(/no limit/);
    expect(messages.displayName).toBe('Messages');
  });

  it('an older backend with no flag at all reads as before Apply', () => {
    expect(usageRowsFrom(raw(undefined))[0]).toMatchObject({ included: 96000 });
  });

  it('own key: no plan allowance to measure against, as before', () => {
    const [ai] = usageRowsFrom(raw(false), false);
    expect(ai.displayName).toMatch(/own AI key/);
    expect(ai).toMatchObject({ included: 0, overage: 0 });
  });
});
