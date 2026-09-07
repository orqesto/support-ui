import { describe, it, expect } from 'vitest';
import {
  buildStepLabels,
  DEFAULT_WIZARD_PLAN,
  initialWizardPlan,
  shouldShowPaymentStep,
  STEP_LABELS,
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

describe('buildStepLabels', () => {
  it('is the six core steps by default (no standalone departments step)', () => {
    expect(buildStepLabels(false)).toEqual([...STEP_LABELS]);
    expect(buildStepLabels(false)).toHaveLength(6);
    // Departments are set up via Channels/routing, never as their own step.
    expect(buildStepLabels(false)).not.toContain('Departments');
  });

  // BYODB §4: the database is chosen BEFORE any channel is connected, so mail lands in the
  // database the workspace keeps — a channel connected first would fill a database the
  // workspace then has to leave.
  it('puts Database right after AI and before Channels', () => {
    const labels = buildStepLabels(false);
    expect(labels.indexOf('Database')).toBe(labels.indexOf('AI setup') + 1);
    expect(labels.indexOf('Database')).toBeLessThan(labels.indexOf('Channels'));
  });

  it('appends Payment as the last step when included', () => {
    const labels = buildStepLabels(true);
    expect(labels).toHaveLength(7);
    expect(labels[6]).toBe('Payment');
    // Core order is untouched, so a resumed step index still means the same step.
    expect(labels.slice(0, 6)).toEqual([...STEP_LABELS]);
  });
});
