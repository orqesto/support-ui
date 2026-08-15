/**
 * The wizard's step registry.
 *
 * Lives apart from the components because the step COUNT is conditional — the
 * payment step only exists for a signup that arrived with a paid plan picked on
 * the marketing site — and both "is this the last step" and "Step N of M" key
 * off it. Keeping the rule pure makes it testable without mounting the wizard.
 */

// Knowledge is intentionally LAST of the core steps: get the setup working
// (departments, AI, storage, channels, team) first, then add KB.
export const STEP_LABELS = [
  'Departments',
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
 * Show the payment step only when the signup carried a paid plan AND a billing
 * provider is actually configured. Self-hosted and not-yet-activated boxes have
 * no Stripe to talk to, and a free / no-plan signup must never see a card step —
 * that is what keeps the marketing site's "no card required" promise true.
 */
export const shouldShowPaymentStep = (
  billingEnabled: boolean,
  selectedPlan: string | undefined
): boolean => billingEnabled && !!selectedPlan && PAID_PLANS.includes(selectedPlan);

export const buildStepLabels = (includePayment: boolean): readonly string[] =>
  includePayment ? [...STEP_LABELS, PAYMENT_STEP_LABEL] : STEP_LABELS;
