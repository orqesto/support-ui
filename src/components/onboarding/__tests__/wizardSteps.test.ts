import { describe, it, expect } from 'vitest';
import { buildStepLabels, shouldShowPaymentStep, STEP_LABELS } from '../wizardSteps';

/**
 * The payment step is the one part of onboarding that can ask for money, so the
 * rule for showing it is worth pinning down: a card step must never appear for a
 * free/no-plan signup (the marketing site promises "no card required"), and never
 * on a deployment with no billing provider to talk to.
 */

describe('shouldShowPaymentStep', () => {
  it('shows for a paid plan when billing is configured', () => {
    expect(shouldShowPaymentStep(true, 'starter')).toBe(true);
    expect(shouldShowPaymentStep(true, 'pro')).toBe(true);
  });

  it('hides when the signup carried no plan', () => {
    expect(shouldShowPaymentStep(true, undefined)).toBe(false);
  });

  it('hides for the free plan', () => {
    expect(shouldShowPaymentStep(true, 'free')).toBe(false);
  });

  it('hides for sales-assisted tiers', () => {
    expect(shouldShowPaymentStep(true, 'enterprise-cloud')).toBe(false);
    expect(shouldShowPaymentStep(true, 'self-hosted')).toBe(false);
  });

  it('hides when billing is not configured, even for a paid plan', () => {
    expect(shouldShowPaymentStep(false, 'pro')).toBe(false);
  });

  it('hides for an unknown plan slug', () => {
    expect(shouldShowPaymentStep(true, 'not-a-plan')).toBe(false);
  });
});

describe('buildStepLabels', () => {
  it('is the six core steps by default', () => {
    expect(buildStepLabels(false)).toEqual([...STEP_LABELS]);
    expect(buildStepLabels(false)).toHaveLength(6);
  });

  it('appends Payment as the last step when included', () => {
    const labels = buildStepLabels(true);
    expect(labels).toHaveLength(7);
    expect(labels[6]).toBe('Payment');
    // Core order is untouched, so a resumed step index still means the same step.
    expect(labels.slice(0, 6)).toEqual([...STEP_LABELS]);
  });
});
