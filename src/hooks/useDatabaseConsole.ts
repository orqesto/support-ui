import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { databaseService } from '@/services/database.service';

/**
 * Platform-console reads and writes for workspaces' databases (BYODB Phase 2). Global-admin
 * only — every call hits `/api/admin/…` under platform scope, so no org context is attached.
 */
const RETENTION_KEY = ['platform', 'database', 'retention'] as const;
const DEGRADED_KEY = ['platform', 'database', 'degraded'] as const;
const orgKey = (organizationId: number) => ['platform', 'database', 'org', organizationId] as const;
const moveKey = (organizationId: number) => ['platform', 'database', 'move', organizationId] as const;

export const useDatabaseRetentionList = () =>
  useQuery({ queryKey: RETENTION_KEY, queryFn: () => databaseService.admin.retention(), staleTime: 30_000 });

export const useDegradedDatabases = () =>
  useQuery({ queryKey: DEGRADED_KEY, queryFn: () => databaseService.admin.degraded(), staleTime: 30_000 });

export const useWorkspaceDatabase = (organizationId: number | null) =>
  useQuery({
    queryKey: orgKey(organizationId ?? 0),
    queryFn: () => databaseService.admin.get(organizationId as number),
    enabled: organizationId !== null,
  });

export const useWorkspaceDatabaseMove = (organizationId: number | null) =>
  useQuery({
    queryKey: moveKey(organizationId ?? 0),
    queryFn: () => databaseService.admin.move(organizationId as number),
    enabled: organizationId !== null,
    // A move in flight changes every few seconds; poll while the dialog is open.
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'pending' || status === 'copying' || status === 'verifying' ? 5_000 : false;
    },
  });

const useInvalidateWorkspace = () => {
  const qc = useQueryClient();
  return (organizationId: number) => {
    void qc.invalidateQueries({ queryKey: orgKey(organizationId) });
    void qc.invalidateQueries({ queryKey: moveKey(organizationId) });
    void qc.invalidateQueries({ queryKey: DEGRADED_KEY });
    void qc.invalidateQueries({ queryKey: RETENTION_KEY });
  };
};

export const useReverifyWorkspaceDatabase = () => {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: (organizationId: number) => databaseService.admin.reverify(organizationId),
    onSettled: (_result, _error, organizationId) => invalidate(organizationId),
  });
};

export const useMigrateWorkspaceDatabase = () => {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: (organizationId: number) => databaseService.admin.migrate(organizationId),
    onSettled: (_result, _error, organizationId) => invalidate(organizationId),
  });
};

export const useConfirmDatabaseCleanup = () => {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: (organizationId: number) => databaseService.admin.confirmCleanup(organizationId),
    onSettled: (_result, _error, organizationId) => invalidate(organizationId),
  });
};
