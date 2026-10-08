/**
 * An own-AI-key workspace has no AI-call allowance (it is the platform key's), so Usage Stats must
 * not show its calls against one — Free (own key required) used to see every call as "overage".
 */
import { describe, expect, it } from 'vitest';
import { usageRowsFrom, type RawUsage } from '../usageStatsRows';

const raw = (applies: boolean | undefined): RawUsage => ({
  aiCalls: { current: 340, limit: 0, overage: 340, percentage: 0, appliesToThisWorkspace: applies },
  messages: { current: 10, limit: 1500, percentage: 1 },
});

describe('Usage Stats rows — AI calls on an own key', () => {
  it('says the allowance does not apply and shows no overage', () => {
    const [ai] = usageRowsFrom(raw(false));
    expect(ai.displayName).toMatch(/own AI key — no plan allowance/);
    expect(ai).toMatchObject({ included: 0, overage: 0, current: 340 });
  });

  it('control: an older backend without the flag keeps the old reading', () => {
    const [ai] = usageRowsFrom(raw(undefined));
    expect(ai).toMatchObject({ displayName: 'AI Calls', overage: 340 });
  });

  it('messages use the limit the backend sends (packs included)', () => {
    expect(usageRowsFrom(raw(true))[1]).toMatchObject({ included: 1500, overage: 0 });
  });
});
