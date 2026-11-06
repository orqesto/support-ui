import { useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { isOrgAdminOrHigher } from '@/types/roles';
import { aiRefusalText } from './starterAllowance';

/** True for an organisation admin or higher: the members who can change the AI settings. */
export const useIsWorkspaceAdmin = (): boolean => {
  const user = useAuthStore((state) => state.user);
  return !!user && isOrgAdminOrHigher(user.role, user.organizationRole);
};

/** `aiRefusalText` for the signed-in user (an organisation admin or higher reads the admin text). */
export const useAiRefusalText = () => {
  const isAdmin = useIsWorkspaceAdmin();
  return useCallback((err: unknown) => aiRefusalText(err, isAdmin), [isAdmin]);
};

