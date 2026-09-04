import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { allianceAdminService } from '@/services/alliance-admin.service';
import type { AllianceRole } from '@/types/roles';

/**
 * React-query hooks for the Alliance admin console. Query keys are namespaced by
 * allianceId so switching alliances invalidates cleanly and two alliances never
 * share a cache entry. Mutations invalidate the affected list AND the overview
 * (counts change).
 */
export const useMyAlliances = (enabled = true) =>
  useQuery({
    queryKey: ['alliance', 'mine'],
    queryFn: () => allianceAdminService.listMyAlliances(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled,
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

/**
 * Candidate users for the add-member picker — alliance-scoped (people already in the
 * alliance's workspaces), so a non-global alliance_admin can seed members without the
 * global-admin platform user directory. `search` is server-side; keyed into the query so
 * each term is its own cache entry.
 */
export const useAllianceMemberCandidates = (
  allianceId: number | null,
  search: string,
  enabled: boolean
) =>
  useQuery({
    queryKey: ['alliance', allianceId, 'member-candidates', search],
    queryFn: () =>
      allianceAdminService.listMemberCandidates(allianceId as number, search || undefined),
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
      // The switcher's orgCount comes from ['alliance','mine'] — refresh it too.
      void queryClient.invalidateQueries({ queryKey: ['alliance', 'mine'] });
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
      // The switcher's orgCount comes from ['alliance','mine'] — refresh it too.
      void queryClient.invalidateQueries({ queryKey: ['alliance', 'mine'] });
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

export const useAllianceAdminProposals = (allianceId: number | null) =>
  useQuery({
    queryKey: ['alliance', allianceId, 'admin-proposals'],
    queryFn: () => allianceAdminService.listAdminProposals(allianceId as number),
    enabled: allianceId !== null,
    refetchOnWindowFocus: false,
  });

export const useAddMember = (allianceId: number | null) => {
  const invalidate = useAllianceListInvalidator(allianceId, 'members');
  return useMutation({
    mutationFn: (input: { userId: number; allianceRole: AllianceRole | null }) =>
      allianceAdminService.addMember(allianceId as number, input.userId, input.allianceRole),
    onSuccess: invalidate,
  });
};

export const useChangeMemberRole = (allianceId: number | null) => {
  const invalidate = useAllianceListInvalidator(allianceId, 'members');
  return useMutation({
    mutationFn: (input: { userId: number; allianceRole: AllianceRole | null }) =>
      allianceAdminService.changeMemberRole(allianceId as number, input.userId, input.allianceRole),
    onSuccess: invalidate,
  });
};

export const useDeactivateMember = (allianceId: number | null) => {
  const invalidate = useAllianceListInvalidator(allianceId, 'members');
  return useMutation({
    mutationFn: (input: { userId: number; reassignToUserId?: number | null }) =>
      allianceAdminService.deactivateMember(
        allianceId as number,
        input.userId,
        input.reassignToUserId ?? null
      ),
    onSuccess: invalidate,
  });
};

export const useReactivateMember = (allianceId: number | null) => {
  const invalidate = useAllianceListInvalidator(allianceId, 'members');
  return useMutation({
    mutationFn: (userId: number) =>
      allianceAdminService.reactivateMember(allianceId as number, userId),
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
