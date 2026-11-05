import { invalidateSharedFetch, sharedFetch } from '@/lib/sharedFetch';
import { useAuthStore } from '@/stores/authStore';
import { roleDefaultsUnavailable } from './notificationRoleDefaultsMemory';
import { fetchRoleDefaults, type RoleDefaults } from './notificationSettingsService';

/**
 * One read of the role defaults per workspace, shared by the Workspace-settings tab probe and the
 * page itself, so opening the tab does not fetch again. Short TTL (the overview carries "who differs"
 * counts); dropped after a save. A workspace whose server has no such endpoint is remembered for the
 * session and never probed again. Everything is keyed by person AND workspace.
 */
const TTL_MS = 60_000;
const unavailable = roleDefaultsUnavailable;

// Per person and workspace: another user on the same browser (sign-out, sign-in) must not inherit
// the last user's answer or the "unavailable" memory.
const keyOf = (orgKey: number | string | null): string =>
  `notification-roles:${String(useAuthStore.getState().user?.id ?? 'anon')}:${String(orgKey)}`;

export const loadRoleDefaults = (orgKey: number | string | null): Promise<RoleDefaults | null> => {
  const key = keyOf(orgKey);
  if (unavailable.has(key)) return Promise.resolve(null);
  return sharedFetch(
    key,
    async () => {
      const res = await fetchRoleDefaults();
      if (res === null) unavailable.add(key);
      return res;
    },
    TTL_MS
  );
};

export const invalidateRoleDefaults = (orgKey: number | string | null): void =>
  invalidateSharedFetch(keyOf(orgKey));

export { resetRoleDefaultsUnavailableForTests } from './notificationRoleDefaultsMemory';
