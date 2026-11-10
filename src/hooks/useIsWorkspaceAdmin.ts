import { useContext } from 'react';
import { QueryClient, QueryClientContext, useQuery } from '@tanstack/react-query';
import { userService } from '@/services/user.service';
import { useAuthStore } from '@/stores/authStore';

/**
 * Used only where no QueryClientProvider is mounted (an isolated component in a test), as in
 * useDepartments: the extra read is then never made and a tab on another workspace than the
 * profile's reads "not an admin". The app always has a provider.
 */
let noProviderClient: QueryClient | undefined;
// Created on first use, never at import: some tests mock the whole query module.
const getNoProviderClient = (): QueryClient => (noProviderClient ??= new QueryClient());

/**
 * Is the caller an admin of the workspace THIS TAB is in — the check the backend makes on a
 * workspace-admin action (global admin, or `org_admin` in the request's workspace context)?
 *
 * `usePermissions().isOrgAdmin` reads `user.organizationRole`, which is the role in the workspace
 * the profile was loaded for. A shared link can move the tab to another workspace without
 * reloading the profile (useSharedLinkWorkspace), so that role can belong to a different
 * workspace: an admin there saw an action this one refuses with 403, and the reverse. When the
 * tab's workspace is not the profile's, the profile is read once for this workspace
 * (GET /api/users/me answers with the role in the request's workspace) and cached per workspace.
 * An answer for any OTHER workspace (the request raced a switch, a backend without that context)
 * says nothing about this one: not an admin.
 *
 * The ONE workspace-admin check: Clear reason on a hold note, and the AI gating (TranslateButton,
 * AiTabPanel, MessageDetailHeader, `useAiRefusalText`) read it, so a tab moved to another
 * workspace never shows that workspace's admin controls by the profile's role.
 *
 * UX gate only — the backend re-checks the live role on every call.
 */
export const useIsWorkspaceAdmin = (): boolean => {
  const user = useAuthStore((state) => state.user);
  const selectedOrganizationId = useAuthStore((state) => state.selectedOrganizationId);
  const isGlobalAdmin = user?.role === 'admin';
  const profileIsThisWorkspace =
    selectedOrganizationId === null || selectedOrganizationId === user?.organizationId;

  const providedClient = useContext(QueryClientContext);
  const enabled =
    providedClient !== undefined && user !== null && !isGlobalAdmin && !profileIsThisWorkspace;
  const { data: profile } = useQuery(
    {
      queryKey: ['workspace-profile', user?.id ?? null, selectedOrganizationId],
      queryFn: () => userService.getCurrentUser(),
      enabled,
      staleTime: 5 * 60 * 1000,
      // The common case reads nothing (the profile IS this workspace's): its empty entry is not
      // collected, so unmounting leaves no garbage-collection timer behind.
      ...(enabled ? {} : { gcTime: Infinity }),
    },
    providedClient ?? getNoProviderClient()
  );

  if (!user) return false;
  if (isGlobalAdmin) return true;
  if (profileIsThisWorkspace) return user.organizationRole === 'org_admin';
  return (
    profile?.organizationId === selectedOrganizationId && profile.organizationRole === 'org_admin'
  );
};
