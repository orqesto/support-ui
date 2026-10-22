import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MessagesSummary, aiSourceOf, messagesSummary } from '../MessagesSummary';

afterEach(cleanup);

const period = {
  key: 'k',
  start: '2026-08-24T11:48:02Z',
  end: '2026-09-24T11:48:02Z',
  source: 'billing' as const,
};

describe('messagesSummary', () => {
  it('says AI included only when the plan carries managed AI', () => {
    expect(messagesSummary(16000, 1240, undefined, true)).toBe(
      '16,000 messages this period, AI included; 1,240 used.'
    );
    expect(messagesSummary(500, 10, undefined, false)).toBe('500 messages this period; 10 used.');
  });

  it('formats the reset day with the browser locale, like the other screens', () => {
    const expected = new Date(period.end).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
    });
    expect(messagesSummary(500, 10, period, true)).toContain(`resets ${expected}.`);
  });

  it('without AI included the line carries the own-key sentence', () => {
    render(<MessagesSummary limit={500} used={10} aiSource="own_key" />);
    expect(screen.getByTestId('messages-summary')).toHaveTextContent(
      'AI runs on your own key; your plan covers 500 messages.'
    );
    expect(screen.getByTestId('messages-summary')).not.toHaveTextContent(/AI included/);
  });
});

describe('aiSourceOf', () => {
  const base = { planName: 'pro', ownKey: false, notInPlan: false, hasStarterAllowance: false };
  it('paid plan with AI: included', () => expect(aiSourceOf(base)).toBe('included'));
  it('own key wins', () => expect(aiSourceOf({ ...base, ownKey: true, hasStarterAllowance: true })).toBe('own_key'));
  it('Free on our key with its starter allowance: starter', () =>
    expect(aiSourceOf({ ...base, planName: 'free', hasStarterAllowance: true })).toBe('starter'));
  it('Free on an older backend: own key (the plan model)', () =>
    expect(aiSourceOf({ ...base, planName: 'free', notInPlan: true })).toBe('own_key'));
  it('Free in own-key mode with no provider: AI is off, not "starter" (review finding 4)', () =>
    expect(
      aiSourceOf({ ...base, planName: 'free', hasStarterAllowance: true, ourAiOff: true })
    ).toBe('ai_off'));
  it('…unless the allowance was in use and is now used up (paused)', () =>
    expect(
      aiSourceOf({
        ...base,
        planName: 'free',
        hasStarterAllowance: true,
        ourAiOff: true,
        starterPaused: true,
      })
    ).toBe('starter'));
  it('ai_off sentence says to add a key', () => {
    render(<MessagesSummary limit={500} used={10} aiSource="ai_off" />);
    expect(screen.getByTestId('messages-summary')).toHaveTextContent(
      'AI is off: add your own AI key to run it; your plan covers 500 messages.'
    );
  });
  it('paid plan, not in plan, no own key: not_in_plan (F3)', () =>
    expect(aiSourceOf({ ...base, notInPlan: true })).toBe('not_in_plan'));
});
