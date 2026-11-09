import { useQuery } from '@tanstack/react-query';
import { userService } from '@/services/user.service';
import { useAuthStore } from '@/stores/authStore';

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
 *
 * UX gate only — the backend re-checks the live role on every call.
 */
export const useIsWorkspaceAdmin = (): boolean => {
  const user = useAuthStore((state) => state.user);
  const selectedOrganizationId = useAuthStore((state) => state.selectedOrganizationId);
  const isGlobalAdmin = user?.role === 'admin';
  const profileIsThisWorkspace =
    selectedOrganizationId === null || selectedOrganizationId === user?.organizationId;

  const { data: profile } = useQuery({
    queryKey: ['workspace-profile', user?.id ?? null, selectedOrganizationId],
    queryFn: () => userService.getCurrentUser(),
    enabled: user !== null && !isGlobalAdmin && !profileIsThisWorkspace,
    staleTime: 5 * 60 * 1000,
  });

  if (!user) return false;
  if (isGlobalAdmin) return true;
  const role = profileIsThisWorkspace ? user.organizationRole : profile?.organizationRole;
  return role === 'org_admin';
};
