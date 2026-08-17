import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  allianceScimService,
  type AllianceRole,
  type AllianceScimConfig,
  type AllianceScimConfigInput,
  type WireTarget,
} from '@/services/alliance-scim.service';

/**
 * React-query hooks for the alliance Provisioning section (05-08). Keys are
 * namespaced by allianceId so switching alliances invalidates cleanly:
 *   ['alliance', id, 'scim']            — config (flags + token list)
 *   ['alliance', id, 'scim-tokens']     — bearer token list
 *   ['alliance', id, 'scim-groupmaps']  — IdP-group → alliance-group maps
 *   ['alliance', id, 'scim-rolemaps']   — IdP-group → alliance_role maps
 * Mutations invalidate only the key(s) they touch and surface sonner toasts.
 */

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

// ─── SCIM config ─────────────────────────────────────────────────────────────
export const useAllianceScimConfig = (allianceId: number | null) =>
  useQuery({
    queryKey: ['alliance', allianceId, 'scim'],
    queryFn: () => allianceScimService.getConfig(allianceId as number),
    enabled: allianceId !== null,
    refetchOnWindowFocus: false,
  });

/** Read-only provisioning telemetry (token/group counts + informational notes). */
export const useAllianceScimTelemetry = (allianceId: number | null) =>
  useQuery({
    queryKey: ['alliance', allianceId, 'scim-telemetry'],
    queryFn: () => allianceScimService.getTelemetry(allianceId as number),
    enabled: allianceId !== null,
    refetchOnWindowFocus: false,
  });

/**
 * The connector event ledger, cursor-paginated newest-first ("Load more" pages back).
 * The service resolves a 404 (pre-ledger backend) to an `available:false` page, so this
 * query never errors on an old BE — the panel hides itself instead. `retry:false` keeps
 * a genuine failure from hammering the endpoint.
 */
export const useAllianceScimEvents = (allianceId: number | null) =>
  useInfiniteQuery({
    queryKey: ['alliance', allianceId, 'scim-events'],
    queryFn: ({ pageParam }) =>
      allianceScimService.listEvents(allianceId as number, {
        limit: 25,
        beforeId: pageParam ?? undefined,
      }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: allianceId !== null,
    refetchOnWindowFocus: false,
    retry: false,
  });

export const useSaveAllianceScimConfig = (allianceId: number | null) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AllianceScimConfigInput): Promise<AllianceScimConfig> =>
      allianceScimService.putConfig(allianceId as number, input),
    onSuccess: (config) => {
      // The config response carries the token list — refresh both views.
      void queryClient.invalidateQueries({ queryKey: ['alliance', allianceId, 'scim'] });
      void queryClient.invalidateQueries({ queryKey: ['alliance', allianceId, 'scim-tokens'] });
      void queryClient.invalidateQueries({ queryKey: ['alliance', allianceId, 'overview'] });
      toast.success(config.enabled ? 'SCIM saved and enabled' : 'SCIM configuration saved');
    },
    onError: (error: unknown) =>
      toast.error(errorMessage(error, 'Could not save SCIM configuration')),
  });
};

// ─── Bearer tokens ───────────────────────────────────────────────────────────
export const useAllianceScimTokens = (allianceId: number | null) =>
  useQuery({
    queryKey: ['alliance', allianceId, 'scim-tokens'],
    queryFn: () => allianceScimService.listTokens(allianceId as number),
    enabled: allianceId !== null,
    refetchOnWindowFocus: false,
  });

const useTokensInvalidator = (allianceId: number | null) => {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['alliance', allianceId, 'scim-tokens'] });
    // The config view embeds the token list too.
    void queryClient.invalidateQueries({ queryKey: ['alliance', allianceId, 'scim'] });
  };
};

export const useMintAllianceScimToken = (allianceId: number | null) => {
  const invalidate = useTokensInvalidator(allianceId);
  return useMutation({
    mutationFn: (label?: string) => allianceScimService.mintToken(allianceId as number, label),
    onSuccess: () => {
      invalidate();
      toast.success('Token created — copy it now, it is shown only once');
    },
    onError: (error: unknown) => toast.error(errorMessage(error, 'Could not generate token')),
  });
};

export const useRevokeAllianceScimToken = (allianceId: number | null) => {
  const invalidate = useTokensInvalidator(allianceId);
  return useMutation({
    mutationFn: (tokenId: number) => allianceScimService.revokeToken(allianceId as number, tokenId),
    onSuccess: () => {
      invalidate();
      toast.success('Token revoked');
    },
    onError: (error: unknown) => toast.error(errorMessage(error, 'Could not revoke token')),
  });
};

// ─── IdP-group → alliance-group maps ─────────────────────────────────────────
export const useAllianceGroupMaps = (allianceId: number | null) =>
  useQuery({
    queryKey: ['alliance', allianceId, 'scim-groupmaps'],
    queryFn: () => allianceScimService.listGroupMaps(allianceId as number),
    enabled: allianceId !== null,
    refetchOnWindowFocus: false,
  });

const useGroupMapsInvalidator = (allianceId: number | null) => {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: ['alliance', allianceId, 'scim-groupmaps'] });
};

export const useSetAllianceGroupMap = (allianceId: number | null) => {
  const invalidate = useGroupMapsInvalidator(allianceId);
  return useMutation({
    mutationFn: (input: { groupId: number; idpGroupExternalId: string }) =>
      allianceScimService.setGroupMap(allianceId as number, input),
    onSuccess: () => {
      void invalidate();
      toast.success('Group mapping saved');
    },
    onError: (error: unknown) => toast.error(errorMessage(error, 'Could not save group mapping')),
  });
};

export const useDeleteAllianceGroupMap = (allianceId: number | null) => {
  const invalidate = useGroupMapsInvalidator(allianceId);
  return useMutation({
    mutationFn: (mappingId: number) =>
      allianceScimService.deleteGroupMap(allianceId as number, mappingId),
    onSuccess: () => {
      void invalidate();
      toast.success('Group mapping removed');
    },
    onError: (error: unknown) => toast.error(errorMessage(error, 'Could not remove group mapping')),
  });
};

// ─── IdP-group → alliance_role maps (D-05 elevation) ─────────────────────────
export const useAllianceRoleMaps = (allianceId: number | null) =>
  useQuery({
    queryKey: ['alliance', allianceId, 'scim-rolemaps'],
    queryFn: () => allianceScimService.listRoleMaps(allianceId as number),
    enabled: allianceId !== null,
    refetchOnWindowFocus: false,
  });

const useRoleMapsInvalidator = (allianceId: number | null) => {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: ['alliance', allianceId, 'scim-rolemaps'] });
};

export const useSetAllianceRoleMap = (allianceId: number | null) => {
  const invalidate = useRoleMapsInvalidator(allianceId);
  return useMutation({
    mutationFn: (input: { idpGroupExternalId: string; mappedRole: AllianceRole }) =>
      allianceScimService.setRoleMap(allianceId as number, input),
    onSuccess: (row) => {
      void invalidate();
      toast.success(
        row.mappedRole === 'alliance_admin'
          ? 'Role mapping saved — this IdP group will gain alliance-admin on next sync'
          : 'Role mapping saved'
      );
    },
    onError: (error: unknown) => toast.error(errorMessage(error, 'Could not save role mapping')),
  });
};

export const useDeleteAllianceRoleMap = (allianceId: number | null) => {
  const invalidate = useRoleMapsInvalidator(allianceId);
  return useMutation({
    mutationFn: (mappingId: number) =>
      allianceScimService.deleteRoleMap(allianceId as number, mappingId),
    onSuccess: () => {
      void invalidate();
      toast.success('Role mapping removed');
    },
    onError: (error: unknown) => toast.error(errorMessage(error, 'Could not remove role mapping')),
  });
};

// ─── Synced ("draft") IdP groups — visibility + wire-with-backfill + re-sync ──
export const useAllianceSyncedGroups = (allianceId: number | null) =>
  useQuery({
    queryKey: ['alliance', allianceId, 'scim-synced-groups'],
    queryFn: () => allianceScimService.listSyncedGroups(allianceId as number),
    enabled: allianceId !== null,
    refetchOnWindowFocus: false,
  });

/**
 * Wiring or re-syncing touches memberships, role/group maps and the telemetry counts, so
 * both mutations invalidate that whole cluster (plus the members/overview surfaces the
 * backfill mutates).
 */
const useProvisioningWriteInvalidator = (allianceId: number | null) => {
  const queryClient = useQueryClient();
  return () => {
    for (const surface of [
      'scim-synced-groups',
      'scim-groupmaps',
      'scim-rolemaps',
      'scim-telemetry',
      'members',
      'overview',
    ]) {
      void queryClient.invalidateQueries({ queryKey: ['alliance', allianceId, surface] });
    }
  };
};

export const useWireSyncedGroup = (allianceId: number | null) => {
  const invalidate = useProvisioningWriteInvalidator(allianceId);
  return useMutation({
    mutationFn: (input: { idpGroupExternalId: string; target: WireTarget }) =>
      allianceScimService.wireSyncedGroup(allianceId as number, input),
    onSuccess: (result) => {
      invalidate();
      toast.success(`Access wired — ${result.usersReconciled} member(s) synced`);
    },
    onError: (error: unknown) => toast.error(errorMessage(error, 'Could not wire access')),
  });
};

export const useResyncAllianceProvisioning = (allianceId: number | null) => {
  const invalidate = useProvisioningWriteInvalidator(allianceId);
  return useMutation({
    mutationFn: () => allianceScimService.resync(allianceId as number),
    onSuccess: (result) => {
      invalidate();
      toast.success(`Re-synced ${result.usersReconciled} member(s)`);
    },
    onError: (error: unknown) => toast.error(errorMessage(error, 'Could not re-sync provisioning')),
  });
};
