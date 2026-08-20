import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { applyServerRolePermissions, type Permission, type UserRole } from '@/types/roles';
import { useAuthStore } from '@/stores/authStore';
import { useRoleMatrixStore } from '@/stores/roleMatrixStore';

type PermissionMatrix = Partial<Record<UserRole, Permission[]>>;

/**
 * Adopt the SERVER's role → permission table.
 *
 * This app used to own a second copy of that table and decide what to render from it.
 * Two copies in two repos with independent deploys drifted: by 2026-08-20 the frontend
 * was short six permissions on every org role, so an org_admin was shown no Audit Logs
 * and no Usage Stats navigation entry while the API served both. The algorithm was never
 * the problem — `computeEffectivePermissions` is identical on both sides — so only the
 * data moves to the server.
 *
 * Deliberately soft in every direction:
 *  - the baked-in table is the initial value, so first paint is correct rather than empty;
 *  - a 404 (backend older than this build) or any failure simply leaves it in place;
 *  - `applyServerRolePermissions` ignores malformed payloads.
 * The worst case is therefore "behaves exactly as it did before", never a blank UI.
 *
 * Call this ONCE, at the app root. Mutating the module table re-renders nothing on its own,
 * so adopting a table bumps `useRoleMatrixStore`, which is what `usePermissions` subscribes
 * to — see the note there for why that indirection exists rather than subscribing every
 * permission-aware component to this query.
 */
export const useRolePermissionMatrix = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const bump = useRoleMatrixStore((state) => state.bump);

  return useQuery({
    queryKey: ['role-permission-matrix'],
    queryFn: async (): Promise<PermissionMatrix> => {
      const res = await apiClient.get<{ success: boolean; data: PermissionMatrix }>(
        '/api/roles/permission-matrix'
      );
      const matrix = res.data?.data ?? {};
      applyServerRolePermissions(matrix);
      bump();
      return matrix;
    },
    enabled: isAuthenticated,
    // The table is a code constant on the server — it only changes when the backend
    // deploys, so re-fetching it more often than a session is pointless.
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
};
