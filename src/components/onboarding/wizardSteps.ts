/**
 * The wizard's step registry.
 *
 * Lives apart from the components because the step COUNT is conditional — the
 * payment step only exists for a signup that arrived with a paid plan picked on
 * the marketing site — and both "is this the last step" and "Step N of M" key
 * off it. Keeping the rule pure makes it testable without mounting the wizard.
 */

// Knowledge is intentionally LAST of the core steps: get the setup working
// (AI, storage, channels, team) first, then add KB.
//
// There is deliberately NO standalone "departments" step: a department only
// becomes reachable once a message source serves it (message_source_departments),
// so departments are set up in the Channels step / Settings routing, never picked
// in the abstract here.
export const STEP_LABELS = [
  'AI setup',
  'Storage',
  'Channels',
  'Team',
  'Knowledge',
] as const;

export const PAYMENT_STEP_LABEL = 'Payment';

/**
 * Plans that get the optional payment step. Mirrors the BE's paid self-serve
 * allowlist (`PAID_SELF_SERVE_PLAN_NAMES` in config/subscriptions.ts) — the BE
 * refuses a checkout session for anything else, so these must agree.
 */
export const PAID_PLANS = ['starter', 'pro'];

/**
 * Show the payment step wherever billing is actually configured. Self-hosted and
 * not-yet-activated boxes have no Stripe to talk to, so they never see it.
 *
 * It is shown even when the signup carried no plan: a visitor who came through
 * the header "Start free" CTA still deserves the option to secure a plan at the
 * end, and the step carries its own plan selector for that case. What keeps the
 * marketing site's "no card required" promise true is that the step is OPTIONAL
 * and nothing is charged — not that it's hidden.
 */
export const shouldShowPaymentStep = (billingEnabled: boolean): boolean => billingEnabled;

/**
 * Which plan the payment step opens on. A plan picked on the marketing site wins;
 * otherwise default to the recommended tier so the step is never a blank choice.
 */
export const DEFAULT_WIZARD_PLAN = 'pro';

export const initialWizardPlan = (selectedPlan: string | undefined): string =>
  selectedPlan && PAID_PLANS.includes(selectedPlan) ? selectedPlan : DEFAULT_WIZARD_PLAN;

export const buildStepLabels = (includePayment: boolean): readonly string[] =>
  includePayment ? [...STEP_LABELS, PAYMENT_STEP_LABEL] : STEP_LABELS;
