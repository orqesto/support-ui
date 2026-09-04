import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Users2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Tooltip } from '@/components/ui/Tooltip';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { GroupEditor } from '@/components/console/GroupEditor';
import { ConsoleLoading } from '@/components/console/ConsoleLoading';
import { ConsolePageHeader } from '@/components/console/ConsolePageHeader';
import { ConsoleEmpty } from '@/components/console/ConsoleEmpty';
import { useAllianceGroups, useDeleteGroup } from '@/hooks/useAllianceGroups';
import { useAllianceOrgs, useAllianceMembers } from '@/hooks/useAllianceAdmin';
import { roleDisplayNames, type UserRole } from '@/types/roles';
import type { AllianceGroup } from '@/services/alliance-groups.service';

/** Friendly label for an org-role enum shown in the Grants column. */
const orgRoleLabel = (role: string): string => roleDisplayNames[role as UserRole] ?? role;

/**
 * Groups list (SPEC §8.3): each group's name, scoped-org count, granted role, and
 * member count, with edit/delete. The editor drawer handles create + edit.
 */
/**
 * A group fed by an IdP is deleted with its wire: `alliance_group_idp_map.group_id` is
 * ON DELETE CASCADE, so provisioning from that IdP group stops too. On taco (2026-08-20) five
 * groups were wired and later deleted, and nothing said the wire went with them — the synced
 * groups fell back to an older legacy display, so the mapping work looked like it had never
 * happened. Say it before the click, not after.
 */
export const deleteDescription = (group: AllianceGroup | null): string => {
  const base =
    'Members lose the roles this group granted across its scoped workspaces (highest-wins means any role from another source is kept). This cannot be undone.';
  const idp = group?.idpGroup;
  if (!idp) return base;
  const name = idp.displayName ?? idp.externalId;
  return `${name} feeds this group from your identity provider. Deleting it also removes that mapping, so new members will stop arriving from ${name} — you would need to wire it again. ${base}`;
};

/**
 * The line under an IdP-fed group's name. These groups are minted by "Change mapping" on the
 * synced-groups screen and NAMED after the IdP group they mirror, so on the Groups list they
 * read as the IdP group itself — and the customer's devops asked why a group was "mapped to
 * itself". Say which IdP group feeds it, in words, on the row.
 */
export const idpFeedLabel = (group: Pick<AllianceGroup, 'idpGroup'>): string | null => {
  const idp = group.idpGroup;
  if (!idp) return null;
  return `Backing group for IdP group ${idp.displayName ?? idp.externalId} — the mapping, not the IdP group itself`;
};

/**
 * Groups an admin AUTHORED versus groups minted by an IdP mapping.
 *
 * "Map access" on the Provisioning screen creates a backing group per IdP group, named after
 * it, and this page listed both kinds in one table with the same delete button. To the
 * customer's admin that read as "my Groups page is full of my IdP groups, why can I delete
 * them, and why are they mapped to themselves". The backing groups are the mapping's
 * implementation detail: they carry the role, they are retired by UNWIRING (Provisioning),
 * never by deleting here.
 */
export const splitGroups = (
  groups: AllianceGroup[]
): { authored: AllianceGroup[]; backing: AllianceGroup[] } => ({
  authored: groups.filter((group) => !group.idpGroup),
  backing: groups.filter((group) => Boolean(group.idpGroup)),
});

const GroupsTable = ({
  groups,
  onEdit,
  onDelete,
}: {
  groups: AllianceGroup[];
  onEdit: (group: AllianceGroup) => void;
  /** Absent = no delete control (backing groups are retired by unwiring, not deleting). */
  onDelete?: (group: AllianceGroup) => void;
}) => (
  <table className="w-full text-sm">
    <thead>
      <tr className="border-b border-border text-muted-foreground">
        <th className="px-4 py-2 font-medium text-left">Group</th>
        <th className="px-4 py-2 font-medium text-left">Grants</th>
        <th className="px-4 py-2 font-medium text-right">Workspaces</th>
        <th className="px-4 py-2 font-medium text-right">Members</th>
        <th className="px-4 py-2 font-medium text-right">Actions</th>
      </tr>
    </thead>
    <tbody>
      {groups.map((group) => (
        <tr key={group.id} className="border-b border-border last:border-0">
          <td className="px-4 py-2">
            <div className="flex gap-2 items-baseline">
              <span className="font-medium text-foreground">{group.name}</span>
              <span className="font-mono text-xs text-muted-foreground">#{group.id}</span>
            </div>
            {group.description && (
              <div className="text-xs text-muted-foreground">{group.description}</div>
            )}
            {idpFeedLabel(group) && (
              <div className="text-xs text-muted-foreground">{idpFeedLabel(group)}</div>
            )}
          </td>
          <td className="px-4 py-2">
            {group.orgRole ? (
              <Badge variant="secondary">{orgRoleLabel(group.orgRole)}</Badge>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </td>
          <td className="px-4 py-2 text-right text-foreground">{group.orgIds.length}</td>
          <td className="px-4 py-2 text-right text-foreground">{group.memberCount}</td>
          <td className="px-4 py-2 text-right">
            <div className="flex gap-1 justify-end">
              <Tooltip content={`Edit ${group.name}`}>
                <Button variant="ghost" onClick={() => onEdit(group)} aria-label={`Edit ${group.name}`}>
                  <Pencil className="w-4 h-4" />
                </Button>
              </Tooltip>
              {onDelete && (
                <Tooltip content={`Delete ${group.name}`}>
                  <Button variant="ghost" onClick={() => onDelete(group)} aria-label={`Delete ${group.name}`}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </Tooltip>
              )}
            </div>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
);

export const ConsoleGroups = () => {
  const { allianceId } = useParams();
  const numericId = allianceId ? Number(allianceId) : null;

  const { data: groups, isLoading, isError, refetch } = useAllianceGroups(numericId);
  const { authored, backing } = splitGroups(groups ?? []);
  const { data: orgs = [] } = useAllianceOrgs(numericId);
  const { data: members = [] } = useAllianceMembers(numericId);
  const deleteGroup = useDeleteGroup(numericId);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<AllianceGroup | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AllianceGroup | null>(null);

  const openCreate = () => {
    setEditing(null);
    setEditorOpen(true);
  };
  const openEdit = (group: AllianceGroup) => {
    setEditing(group);
    setEditorOpen(true);
  };

  const handleDelete = () => {
    if (!deleteTarget) {
      return;
    }
    deleteGroup.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success(`Deleted ${deleteTarget.name}`);
        setDeleteTarget(null);
      },
      onError: (error: unknown) =>
        toast.error(error instanceof Error ? error.message : 'Could not delete group'),
    });
  };

  if (isLoading) {
    return <ConsoleLoading />;
  }

  if (isError || !groups) {
    return (
      <Alert variant="danger">
        <div className="flex gap-3 justify-between items-center">
          <span>Couldn&apos;t load groups.</span>
          <Button variant="secondary" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">
      <ConsolePageHeader
        title="Groups"
        description="Groups you create to grant a role to a set of members in a workspace."
        actions={
          <Button onClick={openCreate}>
            <Plus className="mr-2 w-4 h-4" />
            New group
          </Button>
        }
      />

      {authored.length === 0 ? (
        <Card className="flex flex-col flex-1 min-h-0">
          <ConsoleEmpty
            icon={Users2}
            message="No groups of your own yet. Create one to grant a role to a set of members in a workspace."
          />
        </Card>
      ) : (
        <Card className="flex overflow-hidden flex-col flex-1 min-h-0">
          <CardContent padding="none" className="flex flex-col flex-1 min-h-0">
            <div className="overflow-auto flex-1 min-h-0">
              <GroupsTable groups={authored} onEdit={openEdit} onDelete={setDeleteTarget} />
            </div>
          </CardContent>
        </Card>
      )}
      {backing.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {backing.length} more {backing.length === 1 ? 'group is' : 'groups are'} managed by IdP
          mappings and {backing.length === 1 ? 'lives' : 'live'} on the Provisioning screen. Edit
          or retire {backing.length === 1 ? 'it' : 'them'} there, from the IdP group{' '}
          {backing.length === 1 ? 'it mirrors' : 'they mirror'}.
        </p>
      )}

      <GroupEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        allianceId={numericId}
        group={editing}
        orgs={orgs}
        members={members}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        onConfirm={handleDelete}
        variant="danger"
        confirmText="Delete group"
        title={`Delete ${deleteTarget?.name ?? 'group'}?`}
        description={deleteDescription(deleteTarget)}
      />
    </div>
  );
};
