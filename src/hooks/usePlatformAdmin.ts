import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { platformService } from '@/services/platform.service';

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

export type PlatformUsersFilters = { page: number; pageSize: number; search?: string };

export const usePlatformUsers = (filters: PlatformUsersFilters) =>
  useQuery({
    queryKey: ['platform', 'users', filters.page, filters.search ?? null],
    queryFn: () =>
      platformService.listUsers({
        page: filters.page,
        pageSize: filters.pageSize,
        search: filters.search,
      }),
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });

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

export const useMigrateAllStorage = () =>
  useMutation({
    mutationFn: () => platformService.migrateAllStorage(),
  });
