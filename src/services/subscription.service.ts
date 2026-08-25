import { apiClient } from '@/lib/api-client';

/**
 * Effective on/off state of every feature for the current org (plan grant with
 * any per-org override already applied by the backend).
 */
const getFeatures = () =>
  apiClient
    .get<{ success: boolean; data: { features: Record<string, boolean> } }>(
      '/api/subscriptions/features'
    )
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

export type OrgUsage = {
  current: { messages: number; users: number; integrations: number };
  limits: { messages: number; users: number; integrations: number };
  percentage: { messages: number; users: number; integrations: number };
  month: string;
};

/**
 * Current-month usage + plan limits for the org (GET /api/usage/current).
 * Used to show remaining seats/quota. The endpoint returns the object directly
 * (no { success, data } envelope).
 */
const getUsage = () => apiClient.get<OrgUsage>('/api/usage/current').then((res) => res.data);

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
  trialPeriodDays: number;
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

export const subscriptionService = {
  getFeatures,
  cancelSubscription,
  resumeSubscription,
  openCustomerPortal,
  getUsage,
  createWizardCheckoutSession,
  getPlans,
};
