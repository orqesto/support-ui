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

/**
 * Admin view of ONE flag: what the code ships, what any override says, and which
 * layer actually decided the value.
 *
 * `global`/`organization` are null when no row exists at that scope — which is the
 * normal case, not an error. That is exactly why the console lists KEYS rather than
 * rows: a row listing would show almost nothing.
 */
export interface AdminFeatureFlag {
  key: string;
  codeDefault: boolean;
  global: { enabled: boolean; updatedAt: string; updatedBy: number | null; notes: string | null } | null;
  organization: { enabled: boolean; updatedAt: string; updatedBy: number | null; notes: string | null } | null;
  effective: boolean;
  source: 'organization' | 'global' | 'code_default';
}

export interface AdminFeatureFlagList {
  organizationId: number | null;
  flags: AdminFeatureFlag[];
}

/**
 * Global-admin flag administration. Unlike `getUiFlags` these must NOT fail closed:
 * an admin toggling a flag has to see a real error, not an empty list that reads as
 * "no flags exist".
 */
/**
 * No workspace named means the GLOBAL scope. Spelled out rather than `== null`
 * because both absent and explicit-null reach here and the two must behave the
 * same — a caller that passes `undefined` is not asking for workspace 0.
 */
const isGlobalScope = (organizationId?: number | null): boolean =>
  organizationId === null || organizationId === undefined;

const listAdmin = (organizationId?: number | null): Promise<AdminFeatureFlagList> =>
  apiClient
    .get<{ success: boolean; data: AdminFeatureFlagList }>('/api/admin/platform/feature-flags', {
      params: isGlobalScope(organizationId) ? undefined : { organizationId },
    })
    .then((res) => res.data.data);

/** Write the override row for a scope. Omit `organizationId` for the global row. */
const setFlag = (input: {
  key: string;
  enabled: boolean;
  organizationId?: number | null;
  notes?: string;
}): Promise<void> =>
  apiClient
    .put(`/api/admin/platform/feature-flags/${encodeURIComponent(input.key)}`, {
      enabled: input.enabled,
      ...(isGlobalScope(input.organizationId) ? {} : { organizationId: input.organizationId }),
      ...(input.notes ? { notes: input.notes } : {}),
    })
    .then(() => undefined);

/**
 * Remove the override so the flag falls back to the layer below.
 *
 * Not the same as setting it to `false`: an org row of `false` keeps the flag off
 * even after a later global rollout turns it on. "Stop overriding" and "force off"
 * are different intentions and the UI has to offer both.
 */
const clearFlag = (key: string, organizationId?: number | null): Promise<void> =>
  apiClient
    .delete(`/api/admin/platform/feature-flags/${encodeURIComponent(key)}`, {
      params: isGlobalScope(organizationId) ? undefined : { organizationId },
    })
    .then(() => undefined);

export const featureFlagAdminService = { listAdmin, setFlag, clearFlag };

