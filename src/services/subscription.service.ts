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
const openCustomerPortal = () =>
  apiClient
    .post<{ success: boolean; data: { url: string } }>('/api/subscriptions/portal')
    .then((res) => res.data.data.url);

export const subscriptionService = {
  getFeatures,
  openCustomerPortal,
};
