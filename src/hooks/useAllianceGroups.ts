import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { allianceGroupsService, type AllianceGroup, type GroupCreateInput } from '@/services/alliance-groups.service';

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
      if (nameChanged || descChanged || roleChanged) {
        await allianceGroupsService.update(id, original.id, {
          name: draft.name,
          description: draft.description ?? null,
          orgRole: draft.orgRole,
        });
      }
      const orgsChanged =
        draft.orgIds.length !== original.orgIds.length ||
        draft.orgIds.some((orgId) => !original.orgIds.includes(orgId));
      if (orgsChanged) {
        await allianceGroupsService.setOrgs(id, original.id, draft.orgIds);
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
    onSuccess: invalidate,
  });
};

export const useDeleteGroup = (allianceId: number | null) => {
  const invalidate = useGroupsInvalidator(allianceId);
  return useMutation({
    mutationFn: (groupId: number) => allianceGroupsService.remove(allianceId as number, groupId),
    onSuccess: invalidate,
  });
};
