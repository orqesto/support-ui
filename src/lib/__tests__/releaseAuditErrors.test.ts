/**
 * v1.1.300 release audit (2026-10-23), the error words:
 * - B9: AI_PROVIDER_NOT_CONFIGURED and RATE_LIMITED have our words; AI_NOT_CONFIGURED sends an
 *   admin to Settings and an agent to an admin.
 * - Decision 3: a refusal above a plan limit (team / user / channel) says what exists keeps
 *   working, and an uncoded "User limit reached" 402 never locks the app behind the subscription
 *   gate.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { apiError } from '@/test/apiError';
import { useAuthStore } from '@/stores/authStore';
import { useSubscriptionGateStore } from '@/stores/subscriptionGateStore';
import {
  AI_NOT_CONFIGURED_MESSAGE,
  AI_OFF_AGENT_MESSAGE,
  formatError,
  getApiErrorMessage,
  isAiNotConfiguredError,
  isPlanLimitBody,
  planLimitText,
  rateLimitedText,
} from '../errorMessages';
import { aiRefusalText } from '@/components/subscription/starterAllowance';

beforeEach(() => {
  useSubscriptionGateStore.getState().clear();
  useAuthStore.setState({ selectedOrganizationId: 5 });
});

describe('B9: no AI provider', () => {
  it('AI_NOT_CONFIGURED: admins are sent to Settings, agents to an admin', async () => {
    const err = await apiError(503, { code: 'AI_NOT_CONFIGURED', error: 'No AI provider…' });
    expect(aiRefusalText(err, true)).toBe(AI_NOT_CONFIGURED_MESSAGE);
    expect(aiRefusalText(err, false)).toBe(AI_OFF_AGENT_MESSAGE);
    expect(aiRefusalText(err, false)).not.toMatch(/Settings/);
  });

  it('AI_PROVIDER_NOT_CONFIGURED as a code or as the bare message is the same state', async () => {
    const coded = await apiError(503, { code: 'AI_PROVIDER_NOT_CONFIGURED', error: 'x' });
    const bare = await apiError(400, { error: 'AI_PROVIDER_NOT_CONFIGURED' });
    expect(isAiNotConfiguredError(coded)).toBe(true);
    expect(isAiNotConfiguredError(bare)).toBe(true);
    expect(aiRefusalText(bare, false)).toBe(AI_OFF_AGENT_MESSAGE);
  });

  it('CONTROL: another code is not "no provider"', async () => {
    const err = await apiError(409, { code: 'AI_DRAFTS_OFF', error: 'Drafts off' });
    expect(isAiNotConfiguredError(err)).toBe(false);
  });
});

describe('B9: rate limited', () => {
  it('names the wait from retryAfter', async () => {
    const err = await apiError(429, { code: 'RATE_LIMITED', error: 'Too many', retryAfter: 840 });
    expect(rateLimitedText(err)).toBe('Too many requests right now. Try again in 14 minutes.');
    expect(aiRefusalText(err, false)).toBe('Too many requests right now. Try again in 14 minutes.');
    expect(formatError('send reply', err)).toBe(
      "Couldn't send reply: Too many requests right now. Try again in 14 minutes."
    );
  });

  it('without retryAfter: a plain wait', async () => {
    const err = await apiError(429, { code: 'RATE_LIMITED', error: 'Too many' });
    expect(rateLimitedText(err)).toBe('Too many requests right now. Wait a moment and try again.');
  });
});

describe('decision 3: plan limits', () => {
  it('PLAN_TEAM_LIMIT keeps the server sentence and adds that existing teams keep working', async () => {
    const err = await apiError(403, {
      code: 'PLAN_TEAM_LIMIT',
      error: 'Your plan includes one team.',
    });
    expect(planLimitText(err)).toBe(
      'Your plan includes one team. Your existing teams keep working.'
    );
    expect(getApiErrorMessage(err)).toBe(
      'Your plan includes one team. Your existing teams keep working.'
    );
  });

  it('a newer user-limit code with no sentence gets ours', async () => {
    const err = await apiError(403, { code: 'PLAN_USER_LIMIT' });
    expect(planLimitText(err)).toMatch(/user limit is reached\. Your existing users keep working/);
  });

  it('an older uncoded "User limit reached" / "Integration limit reached" is matched', async () => {
    const users = await apiError(403, { error: 'User limit reached (3/2). Please upgrade your plan.' });
    const channels = await apiError(403, {
      error: 'Integration limit reached (2/1). Pause another channel or upgrade your plan.',
    });
    expect(planLimitText(users)).toBe(
      'User limit reached (3/2). Please upgrade your plan. Your existing users keep working.'
    );
    expect(planLimitText(channels)).toMatch(/Your existing channels keep working\.$/);
  });

  it('CONTROL: an unrelated 403 is not a plan limit', async () => {
    const err = await apiError(403, { error: 'You do not have permission' });
    expect(planLimitText(err)).toBeUndefined();
    expect(isPlanLimitBody({ error: 'You do not have permission' })).toBe(false);
  });

  it('an uncoded 402 "User limit reached" does not raise the subscription gate', async () => {
    await apiError(402, { error: 'User limit reached (3/3). Please upgrade your plan.' });
    expect(useSubscriptionGateStore.getState().gated).toBe(false);
  });

  it('CONTROL: an uncoded 402 that is not a limit still raises the gate', async () => {
    await apiError(402, { error: 'Your subscription is not active.' });
    expect(useSubscriptionGateStore.getState().gated).toBe(true);
  });
});
