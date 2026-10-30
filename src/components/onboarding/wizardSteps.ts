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
// Database sits right after AI and BEFORE Channels on purpose: once a channel is connected
// mail starts landing, and it must land in the database the workspace will keep (BYODB §4).
export const STEP_LABELS = [
  'AI setup',
  'Database',
  'Storage',
  'Channels',
  'People',
  'Knowledge',
] as const;

export const PAYMENT_STEP_LABEL = 'Payment';

/**
 * Plans that get the optional payment step. Mirrors the BE's paid self-serve
 * allowlist (`PAID_SELF_SERVE_PLAN_NAMES` in config/subscriptions.ts) — the BE
 * refuses a checkout session for anything else, so these must agree.
 */
export const PAID_PLANS = ['starter', 'pro', 'enterprise-cloud'];

/**
 * Free is shown FIRST in the payment step and selected unless a paid plan was carried from the
 * marketing site (owner 2026-10-27: a new customer saw three prices and no Free). It never opens
 * a checkout: choosing it keeps the workspace on Free, or puts a workspace with no plan on it.
 */
export const FREE_PLAN = 'free';

/**
 * The one tier that is NOT sold self-serve: a single-tenant installation is not
 * something Checkout can provision, and it carries no Stripe price. Named here
 * so the payment step can show it as a "talk to us" card rather than silently
 * pretending the lineup ends at Enterprise Cloud.
 */
export const SALES_ASSISTED_PLAN = 'self-hosted';

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

/** The plan facts the Finish gate reads (`subscriptionService.getPlanState`). */
export interface WizardPlanState {
  name?: string;
  status?: string;
  cancellationRoute?: string;
}

/**
 * True on a paid plan: a live Stripe subscription (a card — a trial with one converts to
 * paid), or a paid plan in force without one (assigned directly). A trial with no card
 * drops to Free when it ends (trialExpirationService), so it is not paid.
 */
const isOnPaidPlan = (plan: WizardPlanState): boolean => {
  // Only a plan in force can be paid. `cancellationRoute: 'stripe'` means a Stripe id is STORED,
  // and a lapsed subscription keeps its dead id — so it counts only while the status is live.
  const live = plan.status === 'trialing' || plan.status === 'active' || plan.status === 'past_due';
  // The internal admin plan is god mode (owner, 2026-10-30): it allows everything, this included.
  if (!live || plan.name === 'admin') return false;
  return (
    plan.cancellationRoute === 'stripe' || (plan.status !== 'trialing' && plan.name !== FREE_PLAN)
  );
};

/**
 * Whether finishing the wizard needs a connected channel.
 *
 * Only a paid plan needs one. Free — or a trial that will end on Free — may finish setup
 * with no channel yet (owner, 2026-10-30): the Channels step says "Skip this step", and
 * refusing at the last step contradicted it. The header's "no message sources" warning
 * keeps prompting them afterwards. The internal admin plan and a deployment with no billing
 * (self-hosted) allow everything (owner, 2026-10-30), so neither needs one either.
 *
 * Only paid states require it, so a plan read that is stale after a move to Free cannot
 * block, and an unreadable plan (`null`) never traps the user on the last step. A card
 * added in this session counts at once, before the plan read catches up.
 */
export const channelRequiredToFinish = ({
  billingEnabled,
  cardAdded,
  plan,
}: {
  billingEnabled: boolean;
  cardAdded: boolean;
  plan: WizardPlanState | null;
}): boolean => {
  if (!billingEnabled) return false;
  if (cardAdded) return true;
  return plan !== null && isOnPaidPlan(plan);
};

export const buildStepLabels = (includePayment: boolean): readonly string[] =>
  includePayment ? [...STEP_LABELS, PAYMENT_STEP_LABEL] : STEP_LABELS;
