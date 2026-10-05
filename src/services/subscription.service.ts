import { apiClient } from '@/lib/api-client';

/**
 * Effective on/off state of every feature for the current org (plan grant with
 * any per-org override already applied by the backend).
 */
const getFeatures = () =>
  apiClient
    .get<{
      success: boolean;
      data: { features: Record<string, boolean> };
    }>('/api/subscriptions/features')
    .then((res) => res.data.data.features);

/**
 * Open the Stripe Customer Portal. BE creates a Stripe-hosted session and
 * returns the URL; the caller should redirect the browser to it.
 *
 * 400 from BE indicates either: no Stripe customer yet (org hasn't gone
 * through checkout), or BILLING_PROVIDER != stripe. Caller should surface
 * the message rather than silently retrying.
 */
/**
 * Stop the subscription at the end of the paid period.
 *
 * Deliberately not the Stripe portal: the backend cancels a Stripe-backed
 * subscription through Stripe and a manually-assigned one in our own database.
 * Every production organization today is the second kind, which the portal
 * cannot serve at all.
 */
const cancelSubscription = () =>
  apiClient
    .post<{
      success: boolean;
      data: { cancelAt: string; route: 'stripe' | 'local'; accessEndsAt: string };
    }>('/api/subscriptions/cancel')
    .then((res) => res.data.data);

/** Undo a cancellation that has not taken effect yet. */
const resumeSubscription = () =>
  apiClient
    .post<{ success: boolean; data: { resumed: boolean } }>('/api/subscriptions/resume')
    .then((res) => res.data.data);

const openCustomerPortal = () =>
  apiClient
    .post<{ success: boolean; data: { url: string } }>('/api/subscriptions/portal')
    .then((res) => res.data.data.url);

/**
 * The period the message allowance runs over. `billing` = the subscription's own
 * cycle (bought on the 5th, resets on the 5th); `calendar` = the 1st of the month
 * (free and unsubscribed workspaces). `end` is when the counter resets.
 */
export type UsagePeriod = {
  key: string;
  start: string;
  end: string;
  source: 'billing' | 'calendar';
};

/**
 * Whether a message pack can be bought right now. `reason` explains a `false` so
 * the UI can say "upgrade instead" rather than hiding the door without a word.
 */
export type MessagePackOffer = {
  available: boolean;
  reason?:
    | 'billing_disabled'
    | 'pack_not_configured'
    | 'no_subscription'
    | 'not_active'
    | 'free_plan'
    | 'unlimited_plan';
  messages: number;
  priceCents: number;
  currency: string;
};

export type OrgUsage = {
  current: { messages: number; users: number; integrations: number };
  /** `messages` is the plan's cap PLUS any message pack bought into this period. */
  limits: { messages: number; users: number; integrations: number };
  percentage: { messages: number; users: number; integrations: number };
  month: string;
  /**
   * Optional: a backend older than this field still answers, and the banner and
   * usage page must render (without a reset date) rather than white-screen
   * (FE-app/CLAUDE.md, version skew).
   */
  period?: UsagePeriod;
  extra?: { messages: number };
  messagePack?: MessagePackOffer;
};

/**
 * Current-period usage + plan limits for the org (GET /api/usage/current).
 * Used to show remaining seats/quota. The endpoint returns the object directly
 * (no { success, data } envelope).
 */
const getUsage = () => apiClient.get<OrgUsage>('/api/usage/current').then((res) => res.data);

/**
 * Start a one-time Stripe Checkout for a message pack (1,000 messages for €50,
 * credited to the CURRENT period). Returns the hosted Checkout URL; the caller
 * redirects the browser. The backend answers 409 with a one-sentence reason when
 * the workspace may not buy one (trial, lapsed, no cap) — surface it.
 */
const createMessagePackCheckout = () =>
  apiClient
    .post<{
      success: boolean;
      data: {
        checkoutUrl: string;
        sessionId: string;
        messages: number;
        priceCents: number;
        currency: string;
      };
    }>('/api/subscriptions/message-pack/checkout')
    .then((res) => res.data.data);

export type WizardCheckoutSession = {
  /** Client secret for the Stripe UI named by `uiMode`, mounted inline in the wizard. */
  clientSecret: string;
  /**
   * Which Stripe UI this secret drives. Travels WITH the secret rather than
   * being configured separately here: a secret from an `elements` session fails
   * at mount inside embedded checkout (and the reverse) with an opaque Stripe
   * error and no way for the customer to pay.
   *
   * Optional — an older backend omits it, and the fallback below keeps the
   * previous embedded-iframe behaviour rather than rendering nothing.
   */
  uiMode?: 'elements' | 'embedded_page';
  /**
   * Returned with the session rather than read from an FE env var, so it can
   * never belong to a different Stripe account/mode than the secret key that
   * created this session.
   */
  publishableKey: string;
  plan: {
    id: number;
    name: string;
    displayName: string;
    price: number;
    currency: string;
    billingInterval: string;
  };
  /**
   * @deprecated The backend stopped sending this once the trial was anchored to
   * the workspace's real `trialEndsAt`. Kept optional, not deleted, because a
   * production frontend can still be talking to a backend that predates that
   * change — see `chargeDate` in PaymentStep, which uses it only in that case.
   */
  trialPeriodDays?: number;
  /**
   * When the customer is first charged — the org's REAL trial end, not
   * "today + 14" recomputed here. Null means they are charged on completion,
   * because no trial is recorded or too little of one remains for Stripe to
   * accept it. Optional so an older backend still renders.
   */
  trialEndsAt?: string | null;
};

/**
 * Create an embedded Checkout session for the onboarding wizard's payment step.
 *
 * The subscription is created WITH a trial, so completing this collects a card
 * without charging — the org keeps the trial it already has and converts at the
 * end of it. Only the paid self-serve plans (starter, pro) are accepted; the BE
 * refuses anything else.
 */
const createWizardCheckoutSession = (planName: string) =>
  apiClient
    .post<{
      success: boolean;
      data: WizardCheckoutSession;
    }>('/api/subscriptions/checkout-session', { planName })
    .then((res) => res.data.data);

/** The caps a plan row carries. Every field optional — see SubscriptionPlan. */
export type PlanLimitValues = {
  maxUsers: number;
  maxOrganizations: number;
  maxIntegrations: number;
  maxMessagesPerMonth: number;
  maxAICallsPerMonth: number;
  maxStorageMb: number;
  maxAutoRepliesPerMonth: number;
  maxDepartments: number;
};

/** Entitlement flags on a plan row. Every field optional — see SubscriptionPlan. */
export type PlanFeatureFlags = {
  sso: boolean;
  scim: boolean;
  auditLogs: boolean;
  jiraSync: boolean;
  aiAutoReply: boolean;
  advancedAnalytics: boolean;
  leadQualification: boolean;
  customWorkflows: boolean;
  dedicatedOnboarding: boolean;
};

export type SubscriptionPlan = {
  id: number;
  name: string;
  displayName: string;
  planType: string;
  price: number;
  currency: string;
  billingInterval: string;
  /**
   * `limits` and `features` are whole JSON columns and the endpoint selects the
   * entire plan row, so they are already on the wire. Typed as PARTIAL and
   * optional anyway: this frontend deploys ahead of the backend, and a card
   * reading `plan.limits.maxUsers` off an older response would white-screen the
   * final step of onboarding (FE-app/CLAUDE.md, version skew).
   */
  limits?: Partial<PlanLimitValues> | null;
  features?: Partial<PlanFeatureFlags> | null;
};

/** Active, non-admin plans for the current org. */
const getPlans = () =>
  apiClient
    .get<{ success: boolean; data: { plans: SubscriptionPlan[] } }>('/api/subscriptions/plans')
    .then((res) => res.data.data.plans);

/** Who and what counts against a plan (task #8): seats are members, channels are message sources. */
export type PlanFitMember = {
  userId: number;
  name: string;
  email: string;
  role: string;
  state: 'active' | 'paused';
  joinedAt: string | null;
};
export type PlanFitChannel = {
  id: number;
  name: string;
  type: string;
  state: 'active' | 'paused';
  createdAt: string | null;
};
export type PlanFit = {
  /** Pausing is on for this workspace (`billing.free_pause`). Off → the old behaviour, no choice to make. */
  enforced: boolean;
  limits: { maxUsers: number; maxIntegrations: number };
  over: { members: number; sources: number };
  members: PlanFitMember[];
  channels: PlanFitChannel[];
};
export type KeepChoice = { memberUserIds: number[]; sourceIds: number[] };

const toNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const asList = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    : [];

/**
 * Normalised defensively (FE-app/CLAUDE.md, version skew): this frontend can reach production
 * before the backend that serves `/plan-fit`. Anything missing reads as "not enforced, nothing
 * over" — the screen then simply does not appear.
 */
export const normalizePlanFit = (raw: unknown): PlanFit => {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const limits = (data.limits ?? {}) as Record<string, unknown>;
  const over = (data.over ?? {}) as Record<string, unknown>;
  return {
    enforced: data.enforced === true,
    limits: {
      maxUsers: toNumber(limits.maxUsers, 0),
      maxIntegrations: toNumber(limits.maxIntegrations, 0),
    },
    over: { members: toNumber(over.members, 0), sources: toNumber(over.sources, 0) },
    members: asList(data.members).map((member) => {
      const email = typeof member.email === 'string' ? member.email : '';
      return {
        userId: toNumber(member.userId, 0),
        name: typeof member.name === 'string' && member.name ? member.name : email,
        email,
        role: typeof member.role === 'string' ? member.role : '',
        state: member.state === 'paused' ? ('paused' as const) : ('active' as const),
        joinedAt: typeof member.joinedAt === 'string' ? member.joinedAt : null,
      };
    }),
    channels: asList(data.channels).map((channel) => ({
      id: toNumber(channel.id, 0),
      name: typeof channel.name === 'string' ? channel.name : '',
      type: typeof channel.type === 'string' ? channel.type : '',
      state: channel.state === 'paused' ? 'paused' : 'active',
      createdAt: typeof channel.createdAt === 'string' ? channel.createdAt : null,
    })),
  };
};

/** `plan` omitted → the current plan. */
const getPlanFit = (plan?: string) =>
  apiClient
    .get<{
      success: boolean;
      data: unknown;
    }>('/api/subscriptions/plan-fit', { params: plan ? { plan } : {} })
    .then((res) => normalizePlanFit(res.data.data));

/** Choose who and what stays active within the current plan; the rest is paused, never deleted. */
const setActiveWithinPlan = (keep: KeepChoice) =>
  apiClient
    .put<{ success: boolean; data: unknown }>('/api/subscriptions/plan-fit/active', keep)
    .then((res) => res.data.data);

export const subscriptionService = {
  getPlanFit,
  setActiveWithinPlan,
  getFeatures,
  cancelSubscription,
  resumeSubscription,
  openCustomerPortal,
  getUsage,
  createMessagePackCheckout,
  createWizardCheckoutSession,
  getPlans,
};
