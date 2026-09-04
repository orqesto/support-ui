import { useQuery } from '@tanstack/react-query';
import { departmentService, type Department } from '@/services/department.service';
import { useAuthStore } from '@/stores/authStore';

export const useDepartments = () => {
  // Departments are per-workspace, so the cache entry must be too — same shape as
  // `useTicketsCount` / `useNotificationCounts`. Keyed on `['departments']` alone, an
  // in-place org switch (the console's WorkspaceShell repoints the context on mount)
  // kept serving workspace A's list for the 5-minute staleTime, so workspace B's threads
  // wore A's department labels.
  const orgId = useAuthStore(
    (state) => state.selectedOrganizationId ?? state.user?.organizationId ?? null
  );
  return useQuery<Department[]>({
    queryKey: ['departments', orgId],
    // Wrap in an arrow: getAll now takes an optional `includeInactive` flag, and
    // React Query would otherwise pass its QueryFunctionContext as that argument.
    queryFn: () => departmentService.getAll(),
    staleTime: 5 * 60 * 1000, // 5 min
  });
};

export const useDepartmentById = (id: number | null | undefined): Department | undefined => {
  const { data } = useDepartments();
  if (id === null || id === undefined) return undefined;
  return data?.find((dept) => dept.id === id);
};
