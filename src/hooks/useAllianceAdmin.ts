import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { allianceAdminService } from '@/services/alliance-admin.service';
import type { AllianceRole } from '@/types/roles';

/**
 * React-query hooks for the Alliance admin console. Query keys are namespaced by
 * allianceId so switching alliances invalidates cleanly and two alliances never
 * share a cache entry. Mutations invalidate the affected list AND the overview
 * (counts change).
 */
export const useMyAlliances = () =>
  useQuery({
    queryKey: ['alliance', 'mine'],
    queryFn: () => allianceAdminService.listMyAlliances(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

export const useAllianceOverview = (allianceId: number | null) =>
  useQuery({
    queryKey: ['alliance', allianceId, 'overview'],
    queryFn: () => allianceAdminService.getOverview(allianceId as number),
    enabled: allianceId !== null,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

// ─── Organizations ───────────────────────────────────────────────────────────
export const useAllianceOrgs = (allianceId: number | null) =>
  useQuery({
    queryKey: ['alliance', allianceId, 'orgs'],
    queryFn: () => allianceAdminService.listOrgs(allianceId as number),
    enabled: allianceId !== null,
    refetchOnWindowFocus: false,
  });

export const useAttachableOrgs = (allianceId: number | null, enabled: boolean) =>
  useQuery({
    queryKey: ['alliance', allianceId, 'attachable-orgs'],
    queryFn: () => allianceAdminService.listAttachableOrgs(allianceId as number),
    enabled: allianceId !== null && enabled,
    refetchOnWindowFocus: false,
  });

const useAllianceListInvalidator = (allianceId: number | null, listKey: string) => {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['alliance', allianceId, listKey] });
    void queryClient.invalidateQueries({ queryKey: ['alliance', allianceId, 'overview'] });
  };
};

export const useAttachOrg = (allianceId: number | null) => {
  const invalidate = useAllianceListInvalidator(allianceId, 'orgs');
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orgId: number) => allianceAdminService.attachOrg(allianceId as number, orgId),
    onSuccess: () => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ['alliance', allianceId, 'attachable-orgs'] });
    },
  });
};

export const useDetachOrg = (allianceId: number | null) => {
  const invalidate = useAllianceListInvalidator(allianceId, 'orgs');
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orgId: number) => allianceAdminService.detachOrg(allianceId as number, orgId),
    onSuccess: () => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ['alliance', allianceId, 'attachable-orgs'] });
    },
  });
};

// ─── Members ─────────────────────────────────────────────────────────────────
export const useAllianceMembers = (allianceId: number | null) =>
  useQuery({
    queryKey: ['alliance', allianceId, 'members'],
    queryFn: () => allianceAdminService.listMembersEffective(allianceId as number),
    enabled: allianceId !== null,
    refetchOnWindowFocus: false,
  });

export const useAddMember = (allianceId: number | null) => {
  const invalidate = useAllianceListInvalidator(allianceId, 'members');
  return useMutation({
    mutationFn: (input: { userId: number; allianceRole: AllianceRole }) =>
      allianceAdminService.addMember(allianceId as number, input.userId, input.allianceRole),
    onSuccess: invalidate,
  });
};

export const useChangeMemberRole = (allianceId: number | null) => {
  const invalidate = useAllianceListInvalidator(allianceId, 'members');
  return useMutation({
    mutationFn: (input: { userId: number; allianceRole: AllianceRole }) =>
      allianceAdminService.changeMemberRole(allianceId as number, input.userId, input.allianceRole),
    onSuccess: invalidate,
  });
};

export const useRemoveMember = (allianceId: number | null) => {
  const invalidate = useAllianceListInvalidator(allianceId, 'members');
  return useMutation({
    mutationFn: (userId: number) => allianceAdminService.removeMember(allianceId as number, userId),
    onSuccess: invalidate,
  });
};
