import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { GroupEditor } from '@/components/console/GroupEditor';
import { ConsoleLoading } from '@/components/console/ConsoleLoading';
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
export const ConsoleGroups = () => {
  const { allianceId } = useParams();
  const numericId = allianceId ? Number(allianceId) : null;

  const { data: groups, isLoading, isError, refetch } = useAllianceGroups(numericId);
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
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-foreground">Groups</h1>
        <Button onClick={openCreate}>
          <Plus className="mr-2 w-4 h-4" />
          New group
        </Button>
      </div>

      {groups.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              No groups yet. Create one to grant a role to a set of members across chosen organizations.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent padding="none">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="px-4 py-3 font-medium text-left">Group</th>
                  <th className="px-4 py-3 font-medium text-left">Grants</th>
                  <th className="px-4 py-3 font-medium text-right">Orgs</th>
                  <th className="px-4 py-3 font-medium text-right">Members</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <tr key={group.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{group.name}</div>
                      {group.description && (
                        <div className="text-xs text-muted-foreground">{group.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {group.orgRole ? <Badge variant="secondary">{orgRoleLabel(group.orgRole)}</Badge> : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-foreground">{group.orgIds.length}</td>
                    <td className="px-4 py-3 text-right text-foreground">{group.memberCount}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" onClick={() => openEdit(group)} aria-label={`Edit ${group.name}`}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" onClick={() => setDeleteTarget(group)} aria-label={`Delete ${group.name}`}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
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
        description="Members lose the roles this group granted across its scoped organizations (highest-wins means any role from another source is kept). This cannot be undone."
      />
    </div>
  );
};
