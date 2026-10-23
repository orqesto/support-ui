/**
 * Release review HIGH (2026-10-23): the backend strips money from /api/usage/current for
 * non-admins (usageController `withoutMoney`): each allowance arrives as
 * `{ totalMicros: null, usedMicros: null, remainingMicros: null, usedPercent, exhausted }`, with
 * `starterOnOurKey`. A moderator or support user on Free must still read "starter allowance" and a
 * percentage — never "AI runs on your own key", never dollars.
 */
import { describe, expect, it } from 'vitest';
import { normalizeUsage, type OrgUsage } from '@/services/subscription.service';
import { aiSourceFrom } from '../MessagesSummary';
import { kbAllowanceLine, starterAllowanceLine } from '../starterAllowance';

const usageWith = (ai: Record<string, unknown>) =>
  normalizeUsage({
    current: { messages: 1, users: 1, integrations: 1 },
    limits: { messages: 100, users: 2, integrations: 1 },
    percentage: { messages: 1, users: 50, integrations: 100 },
    month: '2026-10',
    ai,
  } as unknown as OrgUsage);

const base = {
  currency: 'USD',
  active: true,
  usedMicros: null,
  budgetMicros: null,
  paused: false,
  bulkPaused: false,
  reason: null,
  message: null,
  resetsAt: null,
  kbPaused: false,
  kbMessage: null,
  unavailableReason: null,
};

// The exact non-admin payload of usageController withoutMoney.
const nonAdmin = {
  ...base,
  starterAllowance: { totalMicros: null, usedMicros: null, remainingMicros: null, usedPercent: 37, exhausted: false },
  kbStarterAllowance: { totalMicros: null, usedMicros: null, remainingMicros: null, usedPercent: 100, exhausted: true },
  starterOnOurKey: true,
};
// …and the admin payload (control).
const admin = {
  ...base,
  starterAllowance: { totalMicros: 400_000, usedMicros: 148_000, remainingMicros: 252_000, exhausted: false },
  kbStarterAllowance: { totalMicros: 1_000_000, usedMicros: 250_000, remainingMicros: 750_000, exhausted: false },
  starterOnOurKey: true,
};
const keys = { ownKey: false, ourAiOff: false };

describe('a non-admin on Free (money-free allowance)', () => {
  const ai = usageWith(nonAdmin).ai;

  it('the allowance is kept, so AI runs on the starter allowance, not "your own key"', () => {
    expect(ai?.starterAllowance).toBeDefined();
    expect(aiSourceFrom('free', ai, keys)).toBe('starter');
  });

  it('the lines show a percentage and no money, even for a viewer the FE counts as admin', () => {
    const allowance = ai?.starterAllowance;
    if (!allowance) throw new Error('no allowance');
    expect(starterAllowanceLine(allowance, false)).toBe('AI starter allowance: about 63% left.');
    expect(starterAllowanceLine(allowance, true)).toBe('AI starter allowance: about 63% left.');
    const kb = ai?.kbStarterAllowance;
    if (!kb) throw new Error('no kb allowance');
    expect(kbAllowanceLine(kb, true)).not.toMatch(/\$/);
    expect(kbAllowanceLine(kb, true)).toMatch(/used up/);
  });

  it('starterOnOurKey false: the allowance is not drawn on — AI is off, not "starter"', () => {
    const off = usageWith({ ...nonAdmin, starterOnOurKey: false }).ai;
    expect(aiSourceFrom('free', off, keys)).toBe('ai_off');
  });
});

describe('CONTROL: the admin payload', () => {
  const ai = usageWith(admin).ai;

  it('keeps messages and money', () => {
    const allowance = ai?.starterAllowance;
    if (!allowance) throw new Error('no allowance');
    expect(aiSourceFrom('free', ai, keys)).toBe('starter');
    expect(starterAllowanceLine(allowance, true)).toBe(
      'AI starter allowance: about 63 of 100 messages left (≈ $0.25 of $0.40 left).'
    );
  });
});
