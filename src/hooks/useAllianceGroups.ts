import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  allianceGroupsService,
  type AllianceGroup,
  type DepartmentIdsByOrg,
  type GroupCreateInput,
} from '@/services/alliance-groups.service';
import { overridesEqual } from '@/types/roles';

/** The mappable departments of one org, for the dept pickers. Disabled until an org is chosen. */
export const useOrgDepartments = (allianceId: number | null, orgId: number | null) =>
  useQuery({
    queryKey: ['alliance', allianceId, 'org', orgId, 'departments'],
    queryFn: () => allianceGroupsService.listOrgDepartments(allianceId as number, orgId as number),
    enabled: allianceId !== null && orgId !== null,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

/**
 * Whether two per-org department maps differ. Only orgs present in `orgIds` count —
 * a mapping left over for a now-removed org is irrelevant (setOrgs replaces the whole
 * set). Order-insensitive within each org.
 */
const deptsChangedFor = (
  orgIds: number[],
  draft: DepartmentIdsByOrg,
  original: DepartmentIdsByOrg
): boolean =>
  orgIds.some((orgId) => {
    const left = [...(draft[orgId] ?? [])].sort((one, two) => one - two);
    const right = [...(original[orgId] ?? [])].sort((one, two) => one - two);
    return left.length !== right.length || left.some((id, idx) => id !== right[idx]);
  });

/**
 * Alliance groups query + save/delete mutations. A single `useSaveGroup` handles
 * both create and edit: on edit it diffs the draft against the original and issues
 * the minimal set of update/setOrgs/add-member/remove-member calls. Every mutation
 * invalidates groups + members + overview (all can change on a reconcile).
 */
export const useAllianceGroups = (allianceId: number | null) =>
  useQuery({
    queryKey: ['alliance', allianceId, 'groups'],
    queryFn: () => allianceGroupsService.list(allianceId as number),
    enabled: allianceId !== null,
    refetchOnWindowFocus: false,
  });

const useGroupsInvalidator = (allianceId: number | null) => {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['alliance', allianceId, 'groups'] });
    void queryClient.invalidateQueries({ queryKey: ['alliance', allianceId, 'members'] });
    void queryClient.invalidateQueries({ queryKey: ['alliance', allianceId, 'overview'] });
  };
};

export type GroupDraft = GroupCreateInput;

export const useSaveGroup = (allianceId: number | null) => {
  const invalidate = useGroupsInvalidator(allianceId);
  return useMutation({
    mutationFn: async (input: { original: AllianceGroup | null; draft: GroupDraft }) => {
      const id = allianceId as number;
      const { original, draft } = input;
      if (!original) {
        await allianceGroupsService.create(id, draft);
        return;
      }
      // Edit: only issue the calls that actually changed.
      const nameChanged = draft.name !== original.name;
      const descChanged = (draft.description ?? null) !== (original.description ?? null);
      const roleChanged = draft.orgRole !== original.orgRole;
      // Overrides ride on the same grant row as the role, so they patch together. The
      // draft omits the key entirely against a backend that does not return it (see
      // GroupEditor) — `undefined` must stay out of the request rather than be sent as
      // an empty object, which the BE would read as "clear the overrides".
      const overridesChanged =
        draft.permissionOverrides !== undefined &&
        !overridesEqual(draft.permissionOverrides, original.permissionOverrides);
      if (nameChanged || descChanged || roleChanged || overridesChanged) {
        await allianceGroupsService.update(id, original.id, {
          name: draft.name,
          description: draft.description ?? null,
          orgRole: draft.orgRole,
          ...(draft.permissionOverrides !== undefined && {
            permissionOverrides: draft.permissionOverrides,
          }),
        });
      }
      const orgsChanged =
        draft.orgIds.length !== original.orgIds.length ||
        draft.orgIds.some((orgId) => !original.orgIds.includes(orgId));
      // setOrgs writes BOTH the org set and the per-org dept mapping in one call, so
      // re-issue it when either changed — a dept edit on an unchanged org set still saves.
      const departmentsChanged = deptsChangedFor(
        draft.orgIds,
        draft.departmentIdsByOrg,
        original.departmentIdsByOrg
      );
      if (orgsChanged || departmentsChanged) {
        await allianceGroupsService.setOrgs(id, original.id, draft.orgIds, draft.departmentIdsByOrg);
      }
      const toAdd = draft.memberIds.filter((userId) => !original.memberIds.includes(userId));
      const toRemove = original.memberIds.filter((userId) => !draft.memberIds.includes(userId));
      for (const userId of toAdd) {
        await allianceGroupsService.addMember(id, original.id, userId);
      }
      for (const userId of toRemove) {
        await allianceGroupsService.removeMember(id, original.id, userId);
      }
    },
    // Edit fans out to update→setOrgs→N×add→M×remove sequentially and is NOT atomic:
    // a mid-sequence failure leaves the BE half-updated. Invalidate on settle (error
    // too) so the UI reflects whatever partial writes committed rather than going stale.
    // A fuller fix is an atomic group-PUT on the BE that applies the whole diff in one tx.
    onSettled: invalidate,
  });
};

export const useDeleteGroup = (allianceId: number | null) => {
  const invalidate = useGroupsInvalidator(allianceId);
  return useMutation({
    mutationFn: (groupId: number) => allianceGroupsService.remove(allianceId as number, groupId),
    onSuccess: invalidate,
  });
};
