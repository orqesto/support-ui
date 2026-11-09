/**
 * v1.1.300 release audit (2026-10-23): where a workspace's AI runs, said the same everywhere.
 * - B3: `ai.unavailableReason` wins — never "AI included" for a workspace with no AI, on any plan
 *   (decision 2: paid plans keep the verified-admin check and say "verify your email").
 * - A-F8: a paid workspace on "own key" with no key enabled is "AI is off", not "AI included".
 * - A-F5: Usage Stats and the Subscription page share `aiSourceFrom`.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessagesSummary, aiSourceFrom, aiSourceOf } from '../MessagesSummary';
import { ADMIN_NOT_VERIFIED_ADMIN_TEXT, unavailableText } from '../starterAllowance';
import type { AiStatus } from '../aiStatus';

const ai = (over: Partial<AiStatus> = {}): AiStatus => ({
  currency: 'USD',
  active: true,
  usedMicros: null,
  budgetMicros: null,
  paused: false,
  bulkPaused: false,
  reason: null,
  message: null,
  resetsAt: null,
  ...over,
});
const onOurs = { ownKey: false, ourAiOff: false };

describe('aiSourceFrom / aiSourceOf', () => {
  it('a paid plan on our AI is "included" (control)', () => {
    expect(aiSourceFrom('pro', ai(), onOurs)).toBe('included');
  });

  it('a paid plan whose admins never verified: not_verified, never included', () => {
    expect(aiSourceFrom('pro', ai({ unavailableReason: 'admin_not_verified' }), onOurs)).toBe(
      'not_verified'
    );
  });

  it('own_key_required reads as AI off', () => {
    expect(aiSourceFrom('free', ai({ unavailableReason: 'own_key_required' }), onOurs)).toBe(
      'ai_off'
    );
  });

  it('a paid plan in own-key mode with no key enabled is AI off (A-F8)', () => {
    expect(aiSourceFrom('starter', ai(), { ownKey: false, ourAiOff: true })).toBe('ai_off');
  });

  it('an own key still wins', () => {
    expect(
      aiSourceFrom('pro', ai({ unavailableReason: 'admin_not_verified' }), {
        ownKey: true,
        ourAiOff: true,
      })
    ).toBe('own_key');
  });

  it('not in plan on a paid plan keeps its own sentence', () => {
    expect(aiSourceOf({ planName: 'pro', ownKey: false, notInPlan: true, hasStarterAllowance: false, ourAiOff: true })).toBe('not_in_plan');
  });
});

describe('MessagesSummary', () => {
  it('not_verified: no "AI included", says an admin must verify', () => {
    render(<MessagesSummary limit={1000} used={10} aiSource="not_verified" />);
    const line = screen.getByTestId('messages-summary').textContent ?? '';
    expect(line).not.toMatch(/AI included/);
    expect(line).toMatch(/AI is off until a workspace admin verifies their email address/);
  });
});

describe('unavailableText on paid plans (decision 2)', () => {
  it('the admin sentence names no Free allowance', () => {
    expect(unavailableText('admin_not_verified', true)).toBe(ADMIN_NOT_VERIFIED_ADMIN_TEXT);
    expect(ADMIN_NOT_VERIFIED_ADMIN_TEXT).not.toMatch(/free/i);
    expect(ADMIN_NOT_VERIFIED_ADMIN_TEXT).toMatch(/Verify your email address/);
  });
});
