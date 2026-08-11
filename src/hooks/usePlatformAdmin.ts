import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { platformService, type UpdatePlanInput } from '@/services/platform.service';
import { organizationService } from '@/services/organization.service';
import { userService } from '@/services/user.service';

/**
 * React-query hooks for the Platform (global-admin) console. Query keys are namespaced
 * under ['platform', ...] so they never collide with the alliance console cache. Paginated
 * lists use `keepPreviousData` so paging/filtering doesn't flash a spinner.
 */

export const usePlatformOverview = () =>
  useQuery({
    queryKey: ['platform', 'overview'],
    queryFn: () => platformService.getOverview(),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

export type PlatformUsersFilters = {
  page: number;
  pageSize: number;
  search?: string;
  role?: 'admin' | 'user';
  verified?: 'verified' | 'unverified';
};

export const usePlatformUsers = (filters: PlatformUsersFilters) =>
  useQuery({
    queryKey: [
      'platform',
      'users',
      filters.page,
      filters.search ?? null,
      filters.role ?? null,
      filters.verified ?? null,
    ],
    queryFn: () =>
      platformService.listUsers({
        page: filters.page,
        pageSize: filters.pageSize,
        search: filters.search,
        role: filters.role,
        verified: filters.verified,
      }),
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });

export const useUpdatePlatformUserRole = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: number; role: 'admin' | 'user' }) =>
      platformService.updateUserRole(id, role),
    onSuccess: () => {
      // Prefix-invalidate every paged/filtered users query + the overview KPI counts.
      void queryClient.invalidateQueries({ queryKey: ['platform', 'users'] });
      void queryClient.invalidateQueries({ queryKey: ['platform', 'overview'] });
    },
  });
};

export type PlatformAuditFilters = {
  page: number;
  pageSize: number;
  action?: string;
  organizationId?: number;
};

export const usePlatformAudit = (filters: PlatformAuditFilters) =>
  useQuery({
    queryKey: [
      'platform',
      'audit',
      filters.page,
      filters.action ?? null,
      filters.organizationId ?? null,
    ],
    queryFn: () =>
      platformService.listAudit({
        page: filters.page,
        pageSize: filters.pageSize,
        action: filters.action,
        organizationId: filters.organizationId,
      }),
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });

/**
 * The full workspace directory for global-admin pickers (e.g. the audit workspace filter).
 * Backed by GET /api/organizations (requireGlobalAdmin → returns every workspace). A single
 * large page is fetched; the platform has far fewer workspaces than the cap.
 */
export const usePlatformWorkspaces = () =>
  useQuery({
    queryKey: ['platform', 'workspaces'],
    // Page through ALL workspaces. The orgs endpoint clamps `limit` to 100, so the old
    // single limit=500 request silently dropped workspaces 101+ from the picker. Follow
    // pagination.totalPages; the 100-page loop cap is a runaway backstop (≤10k workspaces).
    queryFn: async () => {
      const LIMIT = 100;
      const all: Awaited<ReturnType<typeof organizationService.getAll>>['data'] = [];
      let pagination: Awaited<ReturnType<typeof organizationService.getAll>>['pagination'] = {
        page: 1,
        limit: LIMIT,
        total: 0,
        totalPages: 1,
        hasMore: false,
      };
      for (let page = 1; page <= 100; page += 1) {
        const res = await organizationService.getAll(undefined, page, LIMIT);
        all.push(...res.data);
        pagination = res.pagination;
        if (page >= (res.pagination.totalPages || 1) || res.data.length === 0) {
          break;
        }
      }
      return { data: all, pagination };
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

/**
 * The workspaces a single user belongs to (id/name/role), for the platform Users drawer.
 * Backed by GET /api/users/:id/organizations (requireGlobalAdmin). Disabled until a user
 * is selected so the drawer fetches only when opened.
 */
export const useUserOrganizations = (userId: number | null) =>
  useQuery({
    queryKey: ['platform', 'user-organizations', userId],
    queryFn: () => userService.getUserOrganizations(userId as number),
    enabled: userId !== null,
    refetchOnWindowFocus: false,
  });

export const useCreateAlliance = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; slug: string }) =>
      platformService.createAlliance(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['alliance', 'mine'] });
      void queryClient.invalidateQueries({ queryKey: ['platform', 'overview'] });
    },
  });
};

// ─── Plans (global-admin plan catalog) ──────────────────────────────────────────
export const usePlatformPlans = () =>
  useQuery({
    queryKey: ['platform', 'plans'],
    queryFn: () => platformService.getPlans(),
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });

export const usePlatformPlanStats = () =>
  useQuery({
    queryKey: ['platform', 'plan-stats'],
    queryFn: () => platformService.getPlanStats(),
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });

export const useTogglePlatformPlan = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => platformService.togglePlan(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['platform', 'plans'] });
      void queryClient.invalidateQueries({ queryKey: ['platform', 'overview'] });
    },
  });
};

export const useUpdatePlatformPlan = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdatePlanInput }) =>
      platformService.updatePlan(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['platform', 'plans'] });
      void queryClient.invalidateQueries({ queryKey: ['platform', 'plan-stats'] });
      void queryClient.invalidateQueries({ queryKey: ['platform', 'overview'] });
    },
  });
};

// ─── System ───────────────────────────────────────────────────────────────────
export const usePlatformQueueStatus = () =>
  useQuery({
    queryKey: ['platform', 'queue-status'],
    queryFn: () => platformService.getQueueStatus(),
    refetchInterval: 15 * 1000,
    refetchOnWindowFocus: false,
  });

export const usePlatformSyncCheckpoints = () =>
  useQuery({
    queryKey: ['platform', 'sync-checkpoints'],
    queryFn: () => platformService.getSyncCheckpoints(),
    refetchOnWindowFocus: false,
  });

export const useClearSyncCheckpoints = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => platformService.clearSyncCheckpoints(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['platform', 'sync-checkpoints'] });
    },
  });
};
