import { apiClient } from '@/lib/api-client';

/**
 * Availability of user-facing surfaces — whether a screen is finished enough to show.
 *
 * Distinct from plan features (`subscription.service.getFeatures`). A plan feature answers
 * "does this workspace's tier include it"; a ui flag answers "is it built yet". A surface
 * that is still under construction must not be presented as an upsell.
 */
export type UiFeatureFlags = Record<string, boolean>;

/**
 * Resolved `ui.*` flags for the current org.
 *
 * Fails CLOSED — any error resolves to `{}`, which reads as every surface off. Two cases
 * make that the only safe choice: the endpoint 404s in the window where the frontend has
 * deployed and the backend has not (the frontend ships on merge to `main`, the backend on
 * its own train), and a request can simply fail. Both must leave an unfinished page hidden
 * rather than flash it to a customer.
 */
const getUiFlags = (): Promise<UiFeatureFlags> =>
  apiClient
    .get<{ success: boolean; data: UiFeatureFlags }>('/api/feature-flags/ui')
    .then((res) => res.data.data ?? {})
    .catch(() => ({}));

export const featureFlagsService = { getUiFlags };
