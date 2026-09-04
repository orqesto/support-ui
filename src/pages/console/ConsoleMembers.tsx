import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Ban, Plus, RotateCcw, Trash2, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Select } from '@/components/ui/Select';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { Label } from '@/components/ui/Label';
import { DataTable, type ColumnDef } from '@/components/ui/DataTable';
import { Tooltip } from '@/components/ui/Tooltip';
import { Dialog, DialogHeader, DialogTitle, DialogContent } from '@/components/ui/Dialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ConsoleLoading } from '@/components/console/ConsoleLoading';
import { ConsolePageHeader } from '@/components/console/ConsolePageHeader';
import { CONSOLE_PAGE_SIZE as PAGE_SIZE } from '@/components/console/consoleConstants';
import {
  useAllianceMembers,
  useAllianceMemberCandidates,
  useAddMember,
  useChangeMemberRole,
  useDeactivateMember,
  useReactivateMember,
  useRemoveMember,
} from '@/hooks/useAllianceAdmin';
import { roleDisplayNames, type AllianceRole, type UserRole } from '@/types/roles';
import type {
  AllianceCandidateUser,
  AllianceMember,
  EffectiveRole,
} from '@/services/alliance-admin.service';

/** "Jane Doe — jane@acme.com" (falls back to email when no name is set). */
const userOptionLabel = (user: AllianceCandidateUser): string => {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return name ? `${name} — ${user.email}` : user.email;
};

// The alliance axis is a POWER, not a ladder: a member either administers the alliance or does
// not. '' is the select's stand-in for null, since a DOM option value cannot be null.
const NO_POWER = '' as const;
type AlliancePowerValue = typeof NO_POWER | 'alliance_admin';

const ROLE_HELP: Record<AlliancePowerValue, string> = {
  alliance_admin:
    'Alliance admin — manages the alliance and gets workspace-admin access in every workspace.',
  [NO_POWER]:
    'Member — belongs to the alliance with no alliance powers. Workspace access comes from the groups they are in.',
};

/** Friendly label for an org-role enum surfaced in the effective-roles chips. */
const orgRoleLabel = (role: string): string => roleDisplayNames[role as UserRole] ?? role;

const ROLE_LABEL: Record<AlliancePowerValue, string> = {
  alliance_admin: 'Alliance admin',
  [NO_POWER]: 'Member',
};

/** Select value ⇄ stored power. */
const toPower = (value: string): AllianceRole | null =>
  value === 'alliance_admin' ? 'alliance_admin' : null;
const toValue = (power: AllianceRole | null): AlliancePowerValue =>
  power === 'alliance_admin' ? 'alliance_admin' : NO_POWER;
const POWER_OPTIONS: AlliancePowerValue[] = [NO_POWER, 'alliance_admin'];

/**
 * What the Effective-roles column has to say about one member.
 *
 * Exported and pure so the distinction can be pinned in a test: a dash must mean ONLY "never
 * had access here". Access that was taken away has to say so — otherwise an IdP group removal
 * that WORKED is indistinguishable from one that did nothing, because the membership row is
 * untouched either way and the column simply went blank.
 */
export const accessSummary = (
  member: Pick<AllianceMember, 'effectiveRoles'> & { revokedRoles?: EffectiveRole[] }
): { granted: EffectiveRole[]; revoked: EffectiveRole[]; neverHadAccess: boolean } => {
  const granted = member.effectiveRoles ?? [];
  const revoked = member.revokedRoles ?? [];
  return { granted, revoked, neverHadAccess: granted.length === 0 && revoked.length === 0 };
};

/**
 * Members screen (SPEC §8.3): each member's alliance_role (editable) and the
 * per-org roles the reconciler materialized for them (chips). An active member is
 * DEACTIVATED first (a durable, IdP-sync-proof hold that blocks login; the confirm
 * surfaces the C2 offboarding side-effects — session revoke + ticket handover). A
 * deactivated member can then be Reactivated or REMOVED outright.
 *
 * ⛔ "Never hard-removed — offboarding stays the IdP's job" was the rule until the owner
 * asked, looking at five deactivated rows with nowhere to go: "why deactivated users can't
 * be removed? as they can be added again if activated from idp". Removal deletes the
 * membership; an IdP push that activates them again re-creates it. The hold is for the
 * opposite case — keeping someone out WHILE the IdP still lists them.
 */
export const ConsoleMembers = () => {
  const { allianceId } = useParams();
  const numericId = allianceId ? Number(allianceId) : null;

  const { data: members, isLoading, isError, refetch } = useAllianceMembers(numericId);
  const changeRole = useChangeMemberRole(numericId);
  const deactivateMember = useDeactivateMember(numericId);
  const reactivateMember = useReactivateMember(numericId);
  const removeMember = useRemoveMember(numericId);
  const addMember = useAddMember(numericId);

  const [deactivateTarget, setDeactivateTarget] = useState<AllianceMember | null>(null);
  // '' = "leave the tickets unassigned" — the pre-existing behaviour, and the default.
  const [handoverUserId, setHandoverUserId] = useState('');
  const [reactivateTarget, setReactivateTarget] = useState<AllianceMember | null>(null);
  const [removeTarget, setRemoveTarget] = useState<AllianceMember | null>(null);
  const [roleChange, setRoleChange] = useState<{
    member: AllianceMember;
    newRole: AllianceRole | null;
  } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [newRole, setNewRole] = useState<AllianceRole | null>(null);
  const [query, setQuery] = useState('');

  // Searchable user picker for "Add member" — alliance-scoped: candidates are people already
  // in one of the alliance's workspaces (never the global directory), so a NON-global
  // alliance_admin can seed members. The BE already excludes existing alliance members. Only
  // fetches while the add dialog is open, and re-queries per search term (server-side).
  const candidatesQuery = useAllianceMemberCandidates(numericId, userSearch, addOpen);
  const userOptions = useMemo(
    () =>
      (candidatesQuery.data ?? []).map((user) => ({
        value: String(user.id),
        label: userOptionLabel(user),
      })),
    [candidatesQuery.data]
  );

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

  const handleDeactivate = () => {
    if (!deactivateTarget) {
      return;
    }
    const reassignToUserId = handoverUserId === '' ? null : Number(handoverUserId);
    deactivateMember.mutate(
      { userId: deactivateTarget.userId, reassignToUserId },
      {
        onSuccess: ({ reassigned, skippedNoAccess }) => {
          const name = deactivateTarget.name || 'member';
          // The skipped count must reach the admin: they chose a colleague, and a bare
          // "Deactivated" would read as "everything moved" when some of it did not.
          if (skippedNoAccess > 0) {
            toast.warning(
              `Deactivated ${name} — ${reassigned} ticket(s) handed over, ${skippedNoAccess} left unassigned (the colleague has no access to that workspace)`
            );
          } else if (reassignToUserId !== null) {
            toast.success(`Deactivated ${name} — ${reassigned} ticket(s) handed over`);
          } else {
            toast.success(`Deactivated ${name}`);
          }
          setDeactivateTarget(null);
          setHandoverUserId('');
        },
        onError: (error: unknown) =>
          toast.error(error instanceof Error ? error.message : 'Could not deactivate member'),
      }
    );
  };

  const handleReactivate = () => {
    if (!reactivateTarget) {
      return;
    }
    reactivateMember.mutate(reactivateTarget.userId, {
      onSuccess: () => {
        toast.success(`Reactivated ${reactivateTarget.name || 'member'}`);
        setReactivateTarget(null);
      },
      onError: (error: unknown) =>
        toast.error(error instanceof Error ? error.message : 'Could not reactivate member'),
    });
  };

  const handleAdd = () => {
    const parsedId = Number(selectedUserId);
    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      toast.error('Select a user to add');
      return;
    }
    addMember.mutate(
      { userId: parsedId, allianceRole: newRole },
      {
        onSuccess: () => {
          toast.success('Member added');
          setAddOpen(false);
          setSelectedUserId('');
          setUserSearch('');
          setNewRole('alliance_agent');
        },
        onError: (error: unknown) =>
          toast.error(error instanceof Error ? error.message : 'Could not add member'),
      }
    );
  };

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

  const memberColumns: ColumnDef<AllianceMember>[] = [
    {
      id: 'member',
      header: 'Member',
      cell: (member) => (
        <div>
          <div className="flex gap-2 items-center">
            <span className="font-medium text-foreground">
              {member.name || `User #${member.userId}`}
            </span>
            {member.active === false && (
                            <Badge variant={member.heldByAdmin ? 'warning' : 'secondary'}>
                {member.heldByAdmin ? 'Deactivated by admin' : 'Deactivated'}
              </Badge>
            )}
          </div>
          {member.email && <div className="text-xs text-muted-foreground">{member.email}</div>}
        </div>
      ),
    },
    {
      id: 'allianceRole',
      header: 'Alliance role',
      cell: (member) => (
        <Select
          value={toValue(member.allianceRole)}
          disabled={changeRole.isPending && changeRole.variables?.userId === member.userId}
          onChange={(event) => {
            const next = toPower(event.target.value);
            if (next !== member.allianceRole) {
              setRoleChange({ member, newRole: next });
            }
          }}
        >
          {POWER_OPTIONS.map((value) => (
            <option key={value || 'member'} value={value}>
              {ROLE_LABEL[value]}
            </option>
          ))}
        </Select>
      ),
    },
    {
      id: 'effectiveRoles',
      header: 'Effective roles',
      cell: (member) => {
        const { granted, revoked, neverHadAccess } = accessSummary(member);
        if (neverHadAccess) {
          return <span className="text-xs text-muted-foreground">—</span>;
        }
        return (
          <div className="flex flex-wrap gap-1.5">
            {granted.map((role) => (
              <Badge key={role.orgId} variant="secondary">
                {orgRoleLabel(role.role)} in {role.orgName}
              </Badge>
            ))}
            {revoked.map((role) => (
              <Tooltip
                key={`revoked-${role.orgId}`}
                content={`${orgRoleLabel(role.role)} in ${role.orgName} was removed — most often by taking them out of the mapped group in your identity provider.`}
              >
                <Badge
                  variant="secondary"
                  className="text-muted-foreground line-through opacity-70"
                >
                  {orgRoleLabel(role.role)} in {role.orgName}
                </Badge>
              </Tooltip>
            ))}
          </div>
        );
      },
    },
  ];

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

  const memberActions = (member: AllianceMember) => {
    const label = member.name || `User #${member.userId}`;
    return member.active === false ? (
      <div className="flex gap-1 items-center">
        <Tooltip content={`Reactivate ${label}`}>
          <Button
            variant="ghost"
            onClick={() => setReactivateTarget(member)}
            aria-label={`Reactivate ${label}`}
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
        </Tooltip>
        <Tooltip content={`Remove ${label} from the alliance`}>
          <Button
            variant="ghost"
            onClick={() => setRemoveTarget(member)}
            aria-label={`Remove ${label}`}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </Tooltip>
      </div>
    ) : (
      <Tooltip content={`Deactivate ${label} — blocks their Odly login`}>
        <Button
          variant="ghost"
          onClick={() => setDeactivateTarget(member)}
          aria-label={`Deactivate ${label}`}
        >
          <Ban className="w-4 h-4" />
        </Button>
      </Tooltip>
    );
  };

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">
      <ConsolePageHeader
        title="Members"
        description="People granted a role across every workspace in this alliance. With an IdP, members sync automatically via Provisioning (SCIM) + Groups — add here to seed an admin or when there's no IdP."
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 w-4 h-4" />
            Add member
          </Button>
        }
      />

      <Card className="flex overflow-hidden flex-col flex-1 min-h-0">
        <CardContent padding="none" className="flex flex-col flex-1 min-h-0">
          <DataTable
            rows={members}
            rowKey={(member) => member.userId}
            columns={memberColumns}
            actions={memberActions}
            toolbarStart={
              <p className="text-sm text-muted-foreground">
                {members.length} member{members.length === 1 ? '' : 's'}
              </p>
            }
            search={{
              value: query,
              onChange: setQuery,
              placeholder: 'Search members by name or email…',
              clientAccessor: (member) => [member.name, member.email],
            }}
            pagination={{ mode: 'client', pageSize: PAGE_SIZE }}
            empty={{
              icon: Users,
              message: 'No members in this alliance yet.',
              filteredMessage: 'No members match your search.',
            }}
          />
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogHeader>
          <DialogTitle>Add a member</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="alliance-add-user">User</Label>
              <ReactSelect
                id="alliance-add-user"
                value={selectedUserId}
                onChange={setSelectedUserId}
                options={userOptions}
                // Search is server-side (alliance-scoped candidates); only update on real
                // typing, not on blur/menu-close (which fire onInputChange with an empty value).
                onInputChange={(value, meta) => {
                  if (meta.action === 'input-change') {
                    setUserSearch(value);
                  }
                }}
                filterOption={null}
                isLoading={candidatesQuery.isFetching}
                placeholder="Search by name or email…"
                noOptionsMessage={() =>
                  candidatesQuery.isFetching
                    ? 'Searching…'
                    : userSearch
                      ? 'No matching users'
                      : 'Type a name or email to search'
                }
              />
              <p className="text-xs text-muted-foreground">
                Adding a member grants the alliance role below across every workspace in the
                alliance. People already in the alliance are hidden.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="alliance-add-role">Alliance role</Label>
              <Select
                id="alliance-add-role"
                value={toValue(newRole)}
                onChange={(event) => setNewRole(toPower(event.target.value))}
              >
                {POWER_OPTIONS.map((value) => (
                  <option key={value || 'member'} value={value}>
                    {ROLE_LABEL[value]}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground">{ROLE_HELP[toValue(newRole)]}</p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleAdd}
                isLoading={addMember.isPending}
                disabled={!selectedUserId || addMember.isPending}
              >
                Add member
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Not a ConfirmDialog: the offboarding needs an input — WHO takes over the tickets.
          Default is "leave unassigned", the pre-existing behaviour, so an admin in a hurry
          changes nothing. Asked for by the customer in as many words: the departing member's
          tickets have to be re-mapped to another user, not dropped into limbo. */}
      <Dialog
        open={deactivateTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeactivateTarget(null);
            setHandoverUserId('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate {deactivateTarget?.name || 'this member'}?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              They will be blocked from logging in to every workspace in this alliance — their
              sessions are revoked. This stays in effect even if your identity provider still lists
              them as active, until you reactivate them here. Full removal is done in your IdP.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="handover-user">Hand their open tickets to</Label>
              <Select
                id="handover-user"
                value={handoverUserId}
                onChange={(event) => setHandoverUserId(event.target.value)}
              >
                <option value="">Nobody — leave them unassigned</option>
                {(members ?? [])
                  .filter(
                    (member) =>
                      member.active !== false && member.userId !== deactivateTarget?.userId
                  )
                  .map((member) => (
                    <option key={member.userId} value={String(member.userId)}>
                      {member.name || member.email || `User #${member.userId}`}
                    </option>
                  ))}
              </Select>
              <p className="text-xs text-muted-foreground">
                Tickets in workspaces the colleague cannot access stay unassigned — you’ll be told
                how many.
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setDeactivateTarget(null);
                  setHandoverUserId('');
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeactivate}
                disabled={deactivateMember.isPending}
              >
                {deactivateMember.isPending ? 'Deactivating…' : 'Deactivate member'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={reactivateTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setReactivateTarget(null);
          }
        }}
        onConfirm={handleReactivate}
        variant="warning"
        confirmText="Reactivate member"
        title={`Reactivate ${reactivateTarget?.name || 'this member'}?`}
        description="This lifts the hold and restores the member's access from their current identity-provider groups and alliance role, on the next reconcile."
      />

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
        title={`Remove ${removeTarget?.name || 'this member'} from the alliance?`}
        description="They disappear from this list and lose their alliance groups and workspace access. This is not a ban: if your identity provider activates them again, they come back automatically."
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
        confirmText={
          roleChange?.newRole === 'alliance_admin' ? 'Grant alliance admin' : 'Change to agent'
        }
        title={
          roleChange?.newRole === 'alliance_admin'
            ? `Make ${roleChange?.member.name || 'this member'} an alliance admin?`
            : `Change ${roleChange?.member.name || 'this member'} to alliance agent?`
        }
        description={
          roleChange?.newRole === 'alliance_admin'
            ? 'Alliance admins manage identity, provisioning, groups, members and workspaces — this grants workspace-admin access across every workspace in the alliance. Applied on the next reconcile.'
            : 'This lowers the member to alliance agent (associate) across every workspace in the alliance and may reduce their department visibility. Applied on the next reconcile.'
        }
      />
    </div>
  );
};
