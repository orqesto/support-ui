import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, UserMinus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Dialog, DialogHeader, DialogTitle, DialogContent } from '@/components/ui/Dialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ConsoleLoading } from '@/components/console/ConsoleLoading';
import {
  useAllianceMembers,
  useAddMember,
  useChangeMemberRole,
  useRemoveMember,
} from '@/hooks/useAllianceAdmin';
import { ALLIANCE_ROLES, roleDisplayNames, type AllianceRole, type UserRole } from '@/types/roles';
import type { AllianceMember } from '@/services/alliance-admin.service';

/** Friendly label for an org-role enum surfaced in the effective-roles chips. */
const orgRoleLabel = (role: string): string => roleDisplayNames[role as UserRole] ?? role;

const ROLE_LABEL: Record<AllianceRole, string> = {
  alliance_admin: 'Alliance admin',
  alliance_agent: 'Alliance agent',
};

/**
 * Members screen (SPEC §8.3): each member's alliance_role (editable) and the
 * per-org roles the reconciler materialized for them (chips). Removal surfaces
 * the C2 offboarding side-effects (session revoke + ticket reassign) before
 * confirming.
 */
export const ConsoleMembers = () => {
  const { allianceId } = useParams();
  const numericId = allianceId ? Number(allianceId) : null;

  const { data: members, isLoading, isError, refetch } = useAllianceMembers(numericId);
  const changeRole = useChangeMemberRole(numericId);
  const removeMember = useRemoveMember(numericId);
  const addMember = useAddMember(numericId);

  const [removeTarget, setRemoveTarget] = useState<AllianceMember | null>(null);
  const [roleChange, setRoleChange] = useState<{ member: AllianceMember; newRole: AllianceRole } | null>(
    null
  );
  const [addOpen, setAddOpen] = useState(false);
  const [newUserId, setNewUserId] = useState('');
  const [newRole, setNewRole] = useState<AllianceRole>('alliance_agent');

  // An alliance-role change applies across EVERY org in the alliance (admin ⇒
  // org_admin everywhere, agent ⇒ associate), so it's confirmed rather than applied
  // on the raw dropdown change — parity with the gate on the IdP-group elevation path.
  const handleChangeRole = () => {
    if (!roleChange) {
      return;
    }
    const { member, newRole: nextRole } = roleChange;
    changeRole.mutate(
      { userId: member.userId, allianceRole: nextRole },
      {
        onSuccess: () => {
          toast.success('Role updated');
          setRoleChange(null);
        },
        onError: (error: unknown) =>
          toast.error(error instanceof Error ? error.message : 'Could not update role'),
      }
    );
  };

  const handleRemove = () => {
    if (!removeTarget) {
      return;
    }
    removeMember.mutate(removeTarget.userId, {
      onSuccess: () => {
        toast.success(`Removed ${removeTarget.name || 'member'}`);
        setRemoveTarget(null);
      },
      onError: (error: unknown) =>
        toast.error(error instanceof Error ? error.message : 'Could not remove member'),
    });
  };

  const handleAdd = () => {
    const parsedId = Number(newUserId);
    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      toast.error('Enter a valid user ID');
      return;
    }
    addMember.mutate(
      { userId: parsedId, allianceRole: newRole },
      {
        onSuccess: () => {
          toast.success('Member added');
          setAddOpen(false);
          setNewUserId('');
          setNewRole('alliance_agent');
        },
        onError: (error: unknown) =>
          toast.error(error instanceof Error ? error.message : 'Could not add member'),
      }
    );
  };

  const parsedNewUserId = Number(newUserId);
  const newUserIdValid = Number.isInteger(parsedNewUserId) && parsedNewUserId > 0;

  if (isLoading) {
    return <ConsoleLoading />;
  }

  if (isError || !members) {
    return (
      <Alert variant="danger">
        <div className="flex gap-3 justify-between items-center">
          <span>Couldn&apos;t load members.</span>
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
        <h1 className="text-2xl font-bold text-foreground">Members</h1>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 w-4 h-4" />
          Add member
        </Button>
      </div>

      {members.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">No members in this alliance yet.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent padding="none">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="px-4 py-3 font-medium text-left">Member</th>
                  <th className="px-4 py-3 font-medium text-left">Alliance role</th>
                  <th className="px-4 py-3 font-medium text-left">Effective roles</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.userId} className="border-b border-border last:border-0 align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{member.name || `User #${member.userId}`}</div>
                      {member.email && <div className="text-xs text-muted-foreground">{member.email}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <Select
                        value={member.allianceRole}
                        // Server-controlled value with no optimistic update: disable the row
                        // while its change is in flight so it can't visibly revert mid-request.
                        disabled={changeRole.isPending && changeRole.variables?.userId === member.userId}
                        onChange={(event) => {
                          const next = event.target.value as AllianceRole;
                          if (next !== member.allianceRole) {
                            setRoleChange({ member, newRole: next });
                          }
                        }}
                      >
                        {ALLIANCE_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABEL[role]}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-4 py-3">
                      {member.effectiveRoles.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {member.effectiveRoles.map((role) => (
                            <Badge key={role.orgId} variant="secondary">
                              {orgRoleLabel(role.role)} in {role.orgName}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        onClick={() => setRemoveTarget(member)}
                        aria-label={`Remove ${member.name || member.userId}`}
                      >
                        <UserMinus className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogHeader>
          <DialogTitle>Add a member</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="alliance-add-user-id">User ID</Label>
              <Input
                id="alliance-add-user-id"
                inputMode="numeric"
                value={newUserId}
                onChange={(event) => setNewUserId(event.target.value)}
                placeholder="e.g. 42"
              />
              <p className="text-xs text-muted-foreground">
                Enter the user&apos;s internal numeric ID. It must be a whole number greater than zero.
              </p>
              {newUserId.trim().length > 0 && !newUserIdValid && (
                <p className="text-xs text-red-600 dark:text-red-400">
                  Enter a valid user ID (a positive whole number).
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="alliance-add-role">Alliance role</Label>
              <Select
                id="alliance-add-role"
                value={newRole}
                onChange={(event) => setNewRole(event.target.value as AllianceRole)}
              >
                {ALLIANCE_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABEL[role]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAdd} isLoading={addMember.isPending} disabled={!newUserIdValid || addMember.isPending}>
                Add member
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRemoveTarget(null);
          }
        }}
        onConfirm={handleRemove}
        variant="danger"
        confirmText="Remove member"
        title={`Remove ${removeTarget?.name || 'this member'}?`}
        description="This revokes the member's sessions and reassigns their open tickets across every organization in the alliance. Their alliance-managed roles are removed (any direct grant is preserved)."
      />

      <ConfirmDialog
        open={roleChange !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRoleChange(null);
          }
        }}
        onConfirm={handleChangeRole}
        variant={roleChange?.newRole === 'alliance_admin' ? 'danger' : 'warning'}
        confirmText={roleChange?.newRole === 'alliance_admin' ? 'Grant alliance admin' : 'Change to agent'}
        title={
          roleChange?.newRole === 'alliance_admin'
            ? `Make ${roleChange?.member.name || 'this member'} an alliance admin?`
            : `Change ${roleChange?.member.name || 'this member'} to alliance agent?`
        }
        description={
          roleChange?.newRole === 'alliance_admin'
            ? 'Alliance admins manage identity, provisioning, groups, members and organizations — this grants org-admin access across every organization in the alliance. Applied on the next reconcile.'
            : 'This lowers the member to alliance agent (associate) across every organization in the alliance and may reduce their department visibility. Applied on the next reconcile.'
        }
      />
    </div>
  );
};
