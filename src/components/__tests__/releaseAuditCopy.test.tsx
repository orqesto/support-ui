/**
 * v1.1.300 release audit (2026-10-23), the words:
 * - B8: a past_due banner; a cancel says the workspace moves to Free at period end (decision 8).
 * - A-F12 / A-F13 / A-F15: Free plan card, switch-to-Free dialog, onboarding "Use our AI".
 * - Decision 3: a Free workspace with more teams than Free includes keeps them, adds none.
 * - Decision 5: Zendesk tickets are imported as threads.
 * - B3: an agent with no AI gets no dead Translate control.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

let trialStatus: string | undefined;
let canViewSubscription = true;
let viewer: { role: string; organizationRole: string } | null = null;
let aiConfigured = true;

vi.mock('@/stores/onboardingStore', () => ({
  useOnboardingStore: (select: (state: unknown) => unknown) =>
    select({
      trial: trialStatus ? { status: trialStatus, trialEndsAt: null } : null,
      fetchOnce: vi.fn(),
    }),
}));
vi.mock('@/hooks/useBackendVersion', () => ({
  useBackendVersion: () => ({ data: { billingEnabled: true } }),
}));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => canViewSubscription }),
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (state: unknown) => unknown) =>
    select({ user: viewer, selectedOrganizationId: 1 }),
}));
vi.mock('@/hooks/useAiConfigured', () => ({
  useAiConfigured: () => ({ aiConfigured, isLoading: false }),
}));
vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => ({
    translateMessage: vi.fn(),
    translateTicket: vi.fn(),
    translateText: vi.fn(),
    isTranslating: false,
  }),
  useSupportedLanguages: () => ({ languages: [], fetchLanguages: vi.fn() }),
}));

const { TrialBanner } = await import('@/components/layout/TrialBanner');
const { PastDueCard } = await import('@/components/subscription/PastDueCard');
const { cancelConfirmText, cancelledToast, MOVES_TO_FREE_SENTENCE } = await import(
  '@/components/subscription/cancelCopy'
);
const { historyImportAiNote } = await import('@/components/pricing/PricingPlanCard');
const { FREE_SWITCH_DESCRIPTION } = await import('@/components/subscription/starterAllowance');
const { ONBOARDING_MANAGED_AI_TEXT } = await import('@/components/onboarding/steps/AiChoiceStep');
const { overTeamLimitText } = await import('@/components/settings/TeamsSettings');
const { ZENDESK_AS_THREADS } = await import(
  '@/components/settings/zendeskImport/zendeskImportSummary'
);
const { TranslateButton } = await import('@/components/shared/TranslateButton');

beforeEach(() => {
  trialStatus = undefined;
  canViewSubscription = true;
  viewer = { role: 'user', organizationRole: 'org_admin' };
  aiConfigured = true;
});
afterEach(cleanup);

const banner = () =>
  render(
    <MemoryRouter>
      <TrialBanner />
    </MemoryRouter>
  );

describe('B8: past_due and cancel', () => {
  it('past_due: the banner says the payment failed, with Update payment for who can pay', () => {
    trialStatus = 'past_due';
    banner();
    expect(screen.getByTestId('past-due-banner')).toHaveTextContent(
      'Your last payment did not go through.'
    );
    expect(screen.getByRole('link', { name: 'Update payment' })).toBeInTheDocument();
  });

  it('past_due, a member who cannot pay: asks an admin, no link', () => {
    trialStatus = 'past_due';
    canViewSubscription = false;
    banner();
    expect(screen.getByTestId('past-due-banner')).toHaveTextContent(/Ask an admin/);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('CONTROL: an active subscription shows no banner', () => {
    trialStatus = 'active';
    banner();
    expect(screen.queryByTestId('past-due-banner')).toBeNull();
  });

  it('the Subscription page card offers the payment update to who can manage', () => {
    const onUpdate = vi.fn();
    render(<PastDueCard canManage loading={false} onUpdatePayment={onUpdate} />);
    screen.getByRole('button', { name: 'Update payment method' }).click();
    expect(onUpdate).toHaveBeenCalled();
  });

  it('a cancel says the workspace moves to Free at period end, never that it locks', () => {
    expect(cancelledToast('8 November 2026')).toBe(
      'Subscription cancelled. You keep full access until 8 November 2026; then the workspace moves to the Free plan.'
    );
    expect(cancelConfirmText('8 November 2026')).toContain(MOVES_TO_FREE_SENTENCE);
    expect(cancelConfirmText(null)).toContain('moves to the Free plan');
  });
});

describe('Free wording', () => {
  it('A-F12: the Free card says history import uses the KB allowance first, then your key', () => {
    expect(historyImportAiNote({ name: 'free' }, false)).toBe(
      '(analysed with the free knowledge-base allowance of AI on us first, then your own AI key)'
    );
    // CONTROLS: a managed plan and a paid plan without managed AI keep their lines.
    expect(historyImportAiNote({ name: 'pro' }, true)).toBe("(uses the plan's AI allowance)");
    expect(historyImportAiNote({ name: 'legacy' }, false)).toBe('(runs on your own AI key)');
  });

  it('A-F13: the switch-to-Free dialog says "any starter allowance … left"', () => {
    expect(FREE_SWITCH_DESCRIPTION).toMatch(/any starter allowance of AI on us that is left/);
  });

  it('A-F15: onboarding "Use our AI" — trial first, then a one-time allowance on Free', () => {
    expect(ONBOARDING_MANAGED_AI_TEXT).toMatch(/included in your 14-day trial/);
    expect(ONBOARDING_MANAGED_AI_TEXT).toMatch(/Free has a one-time starter allowance/);
    expect(ONBOARDING_MANAGED_AI_TEXT).not.toMatch(/Included in your plan/);
  });
});

describe('decision 3: Free with extra teams', () => {
  it('more teams than the plan includes: they are kept, none can be added', () => {
    expect(overTeamLimitText(1, 3)).toBe(
      'Your workspace keeps its existing teams; Free includes 1 — upgrade to add more.'
    );
  });

  it('CONTROL: at or under the limit, or no limit known: no note', () => {
    expect(overTeamLimitText(1, 1)).toBeUndefined();
    expect(overTeamLimitText(undefined, 5)).toBeUndefined();
    expect(overTeamLimitText(999999, 5)).toBeUndefined();
  });
});

describe('decision 5: Zendesk tickets come in as threads', () => {
  it('says so', () => {
    expect(ZENDESK_AS_THREADS).toMatch(/imported as a thread/);
    expect(ZENDESK_AS_THREADS).toMatch(/not under Tickets/);
  });
});

describe('B3: an agent with no AI gets no dead Translate control', () => {
  it('agent, no AI: nothing rendered', () => {
    aiConfigured = false;
    viewer = { role: 'user', organizationRole: 'support' };
    render(<TranslateButton messageId={5} onTranslated={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Translate' })).toBeNull();
  });

  it('CONTROL: an admin, no AI: the control stays (disabled, with the reason)', () => {
    aiConfigured = false;
    render(<TranslateButton messageId={5} onTranslated={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Translate' })).toBeDisabled();
  });
});
