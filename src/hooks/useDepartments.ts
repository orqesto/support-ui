import { useQuery } from '@tanstack/react-query';
import { departmentService, type Department } from '@/services/department.service';
import { useAuthStore } from '@/stores/authStore';

type DepartmentsQueryData = {
  departments: Department[];
  /** The list response's `teamsEnabled`; undefined on a backend that does not send it yet. */
  teamsEnabled: boolean | undefined;
};

/**
 * `includeInactive`: soft-deleted departments too (each carries `active: false`) — for a view
 * whose "all departments" is the server's, which counts them (the KB cases report).
 *
 * Besides the query result, returns `teamsEnabled` as the backend sent it (undefined on an
 * older backend). Read it through `useTeamsEnabled`, which derives a value when it is missing.
 */
export const useDepartments = ({ includeInactive = false }: { includeInactive?: boolean } = {}) => {
  // Departments are per-workspace, so the cache entry must be too — same shape as
  // `useTicketsCount` / `useNotificationCounts`. Keyed on `['departments']` alone, an
  // in-place org switch (the console's WorkspaceShell repoints the context on mount)
  // kept serving workspace A's list for the 5-minute staleTime, so workspace B's threads
  // wore A's department labels.
  const orgId = useAuthStore(
    (state) => state.selectedOrganizationId ?? state.user?.organizationId ?? null
  );
  const query = useQuery<DepartmentsQueryData>({
    queryKey: includeInactive ? ['departments', orgId, 'with-inactive'] : ['departments', orgId],
    // Wrap in an arrow: getAll takes an optional `includeInactive` flag, and React Query
    // would otherwise pass its QueryFunctionContext as that argument.
    queryFn: async () => {
      let teamsEnabled: boolean | undefined;
      const departments = await departmentService.getAll(includeInactive, (value) => {
        teamsEnabled = value;
      });
      return { departments, teamsEnabled };
    },
    staleTime: 5 * 60 * 1000, // 5 min
  });
  return { ...query, data: query.data?.departments, teamsEnabled: query.data?.teamsEnabled };
};

export const useDepartmentById = (id: number | null | undefined): Department | undefined => {
  const { data } = useDepartments();
  if (id === null || id === undefined) return undefined;
  return data?.find((dept) => dept.id === id);
};
