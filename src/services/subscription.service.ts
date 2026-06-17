import { apiClient } from '@/lib/api-client';

export type ActiveModule = {
  id: number;
  moduleId: number;
  isActive: boolean;
  activatedAt: string;
  name: string;
  displayName: string;
};

const getActiveModules = () =>
  apiClient
    .get<{ success: boolean; data: { modules: ActiveModule[] } }>('/api/subscriptions/modules/active')
    .then((res) => res.data.data.modules);

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
  getActiveModules,
  openCustomerPortal,
};
