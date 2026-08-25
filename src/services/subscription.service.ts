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
  /** Client secret for Stripe's embedded Checkout, mounted inline in the wizard. */
  clientSecret: string;
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

export type SubscriptionPlan = {
  id: number;
  name: string;
  displayName: string;
  planType: string;
  price: number;
  currency: string;
  billingInterval: string;
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
