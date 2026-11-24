import { describe, it, expect } from 'vitest';
import {
  buildWizardSteps,
  channelRequiredToFinish,
  DEFAULT_WIZARD_PLAN,
  initialWizardPlan,
  resumeIndex,
  shouldShowPaymentStep,
  STEP_NUMBER,
} from '../wizardSteps';

/**
 * The payment step is the one part of onboarding that can ask for money, so the
 * rules around it are worth pinning down. It is OPTIONAL and charges nothing —
 * that, not hiding it, is what keeps the site's "no card required" promise true.
 */

describe('shouldShowPaymentStep', () => {
  it('shows wherever billing is configured', () => {
    expect(shouldShowPaymentStep(true)).toBe(true);
  });

  it('hides where there is no billing provider to talk to', () => {
    // Self-hosted / not-yet-activated boxes have no Stripe.
    expect(shouldShowPaymentStep(false)).toBe(false);
  });
});

describe('initialWizardPlan', () => {
  it('opens on the plan picked on the marketing site', () => {
    expect(initialWizardPlan('starter')).toBe('starter');
    expect(initialWizardPlan('pro')).toBe('pro');
    expect(initialWizardPlan('enterprise-cloud')).toBe('enterprise-cloud');
  });

  it('falls back to the recommended tier when no plan was carried', () => {
    expect(initialWizardPlan(undefined)).toBe(DEFAULT_WIZARD_PLAN);
  });

  it('never opens on free or a sales-assisted tier', () => {
    // These are not sellable through self-serve checkout; the BE refuses them,
    // so opening a session on one would only produce an error. Enterprise Cloud
    // is NOT in this set any more — it is sold self-serve like Starter/Pro.
    expect(initialWizardPlan('free')).toBe(DEFAULT_WIZARD_PLAN);
    expect(initialWizardPlan('self-hosted')).toBe(DEFAULT_WIZARD_PLAN);
  });

  it('ignores an unknown plan slug', () => {
    expect(initialWizardPlan('not-a-plan')).toBe(DEFAULT_WIZARD_PLAN);
  });
});

describe('channelRequiredToFinish', () => {
  const gate = (plan: Parameters<typeof channelRequiredToFinish>[0]['plan'], cardAdded = false) =>
    channelRequiredToFinish({ billingEnabled: true, cardAdded, plan });

  it('lets a trial with no card (it ends on Free) finish without a channel', () => {
    // Staging 2026-10-30: Free picked, Channels skipped → "Finish without a card" stayed
    // disabled with "connect a channel", although that step offered "Skip this step".
    expect(gate({ name: 'free', status: 'trialing', cancellationRoute: 'local' })).toBe(false);
    // A paid tier picked on the marketing site, no card: still ends on Free.
    expect(gate({ name: 'pro', status: 'trialing', cancellationRoute: 'local' })).toBe(false);
  });

  it('lets a workspace already on Free finish without a channel', () => {
    expect(gate({ name: 'free', status: 'active', cancellationRoute: 'local' })).toBe(false);
  });

  it('keeps the rule on a paid plan', () => {
    // A trial with a card (live Stripe subscription) converts to paid.
    expect(gate({ name: 'pro', status: 'trialing', cancellationRoute: 'stripe' })).toBe(true);
    // A paid plan assigned directly, no Stripe.
    expect(gate({ name: 'pro', status: 'active', cancellationRoute: 'local' })).toBe(true);
    // A card added in this session, before the plan read catches up.
    expect(gate({ name: 'free', status: 'trialing', cancellationRoute: 'local' }, true)).toBe(true);
  });

  it('a lapsed Stripe subscription (dead id still stored) is not paid', () => {
    // Review 2026-10-30: cancellationRoute 'stripe' means a Stripe id is stored, not that it is live;
    // counting it blocked Finish after "Start on Free" until a reload.
    expect(gate({ name: 'pro', status: 'expired', cancellationRoute: 'stripe' })).toBe(false);
    expect(gate({ name: 'pro', status: 'cancelled', cancellationRoute: 'stripe' })).toBe(false);
  });

  it('does not ask a workspace with no plan in force for a channel', () => {
    // Its way forward is Free (the Database step blocks it until then), and a plan read
    // taken before a move to Free must not keep blocking once it has moved.
    expect(gate({ name: 'free', status: 'expired' })).toBe(false);
    expect(gate({ status: 'none' })).toBe(false);
  });

  it('does not trap the user when the plan cannot be read', () => {
    expect(gate(null)).toBe(false);
    expect(gate({})).toBe(false);
  });

  it('a deployment with no billing (self-hosted) allows finishing without a channel', () => {
    // Owner 2026-10-30: self-hosted / god mode allows everything.
    expect(channelRequiredToFinish({ billingEnabled: false, cardAdded: false, plan: null })).toBe(
      false
    );
    expect(channelRequiredToFinish({ billingEnabled: false, cardAdded: true, plan: null })).toBe(
      false
    );
  });

  it('the internal admin plan (god mode) never needs a channel', () => {
    expect(gate({ name: 'admin', status: 'active', cancellationRoute: 'local' })).toBe(false);
  });
});

describe('buildWizardSteps', () => {
  const base = {
    billingEnabled: true,
    managedAiAvailable: true,
    managedDbAllowed: true,
    savedAiChoice: 'managed' as const,
  };

  it('a self-serve signup on our AI: Mailbox, People, Payment', () => {
    expect(buildWizardSteps(base)).toEqual(['channels', 'people', 'payment']);
  });

  // Owner 11-23: a workspace with no saved AI choice (created by a global admin) is asked; an own
  // key keeps the step, because its form lives only there.
  it.each([[undefined], ['byo' as const]])(
    'saved AI choice %s: the AI step is asked first',
    (savedAiChoice) => {
      expect(buildWizardSteps({ ...base, savedAiChoice })).toEqual([
        'ai',
        'channels',
        'people',
        'payment',
      ]);
    }
  );

  it('billing off (self-hosted): the AI choice stays, no Payment', () => {
    expect(buildWizardSteps({ ...base, billingEnabled: false })).toEqual([
      'ai',
      'channels',
      'people',
    ]);
  });

  it('no managed AI and no managed database: both steps, Database before the mailbox', () => {
    expect(
      buildWizardSteps({ ...base, managedAiAvailable: false, managedDbAllowed: false })
    ).toEqual(['ai', 'database', 'channels', 'people', 'payment']);
  });

  it('never has Storage, Knowledge or a departments step', () => {
    const all = buildWizardSteps({
      billingEnabled: true,
      managedAiAvailable: false,
      managedDbAllowed: false,
      savedAiChoice: undefined,
    });
    expect(all).toHaveLength(5);
  });
});

describe('resumeIndex', () => {
  const steps = buildWizardSteps({
    billingEnabled: true,
    managedAiAvailable: true,
    managedDbAllowed: true,
    savedAiChoice: undefined,
  }); // ai, channels, people, payment

  it('keeps the saved numbers of the steps', () => {
    expect(STEP_NUMBER).toEqual({ ai: 1, database: 2, channels: 4, people: 5, payment: 7 });
  });

  it('a saved 3 (the old Storage step) resumes on the mailbox', () => {
    expect(steps[resumeIndex(steps, 3)]).toBe('channels');
  });

  it('a saved 6 (the old Knowledge step) resumes on Payment', () => {
    expect(steps[resumeIndex(steps, 6)]).toBe('payment');
  });

  it('a saved 7 with no Payment step resumes on the last step', () => {
    const noPayment = steps.filter((id) => id !== 'payment');
    expect(resumeIndex(noPayment, 7)).toBe(noPayment.length - 1);
  });

  it('nothing saved, or no steps yet: the first', () => {
    expect(resumeIndex(steps, undefined)).toBe(0);
    expect(resumeIndex([], 4)).toBe(0);
  });
});
