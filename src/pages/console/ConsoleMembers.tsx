import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, UserMinus, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Select } from '@/components/ui/Select';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { Label } from '@/components/ui/Label';
import { SearchInput } from '@/components/ui/SearchInput';
import { Pagination } from '@/components/ui/Pagination';
import { Tooltip } from '@/components/ui/Tooltip';
import { Dialog, DialogHeader, DialogTitle, DialogContent } from '@/components/ui/Dialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ConsoleLoading } from '@/components/console/ConsoleLoading';
import { ConsolePageHeader } from '@/components/console/ConsolePageHeader';
import { ConsoleEmpty } from '@/components/console/ConsoleEmpty';
import { CONSOLE_PAGE_SIZE as PAGE_SIZE } from '@/components/console/consoleConstants';
import {
  useAllianceMembers,
  useAddMember,
  useChangeMemberRole,
  useRemoveMember,
} from '@/hooks/useAllianceAdmin';
import { usePlatformUsers } from '@/hooks/usePlatformAdmin';
import { ALLIANCE_ROLES, roleDisplayNames, type AllianceRole, type UserRole } from '@/types/roles';
import type { AllianceMember } from '@/services/alliance-admin.service';
import type { PlatformUserRow } from '@/services/platform.service';

/** "Jane Doe — jane@acme.com" (falls back to email when no name is set). */
const userOptionLabel = (user: PlatformUserRow): string => {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return name ? `${name} — ${user.email}` : user.email;
};

const ROLE_HELP: Record<AllianceRole, string> = {
  alliance_admin:
    'Alliance admin — manages the alliance and gets workspace-admin access in every workspace.',
  alliance_agent:
    'Alliance agent — a support agent (associate) in every workspace, with no admin rights.',
};

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
  const [selectedUserId, setSelectedUserId] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [newRole, setNewRole] = useState<AllianceRole>('alliance_agent');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  // Searchable user picker for "Add member". The alliance console is currently
  // global-admin-only, so we reuse the platform user directory (server-side search). When
  // the console is later opened to alliance_admins, swap this for an alliance-scoped user
  // search (requireAllianceAdmin) — the platform endpoint is global-admin-gated.
  const usersQuery = usePlatformUsers({ page: 1, pageSize: 20, search: userSearch || undefined });
  const existingMemberIds = useMemo(
    () => new Set((members ?? []).map((member) => member.userId)),
    [members]
  );
  const userOptions = useMemo(
    () =>
      (usersQuery.data?.rows ?? [])
        .filter((user) => !existingMemberIds.has(user.id))
        .map((user) => ({ value: String(user.id), label: userOptionLabel(user) })),
    [usersQuery.data?.rows, existingMemberIds]
  );

  // Client-side search over the fetched list (name + email), case-insensitive.
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) {
      return members ?? [];
    }
    return (members ?? []).filter(
      (member) =>
        member.name.toLowerCase().includes(term) ||
        (member.email ?? '').toLowerCase().includes(term)
    );
  }, [members, query]);

  // Clamp the page against the filtered result so search never strands the user
  // on an out-of-range page.
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage]
  );

  const handleSearchChange = (value: string) => {
    setQuery(value);
    setPage(1);
  };

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

      {members.length === 0 ? (
        <Card className="flex flex-col flex-1 min-h-0">
          <ConsoleEmpty icon={Users} message="No members in this alliance yet." />
        </Card>
      ) : (
        <Card className="flex overflow-hidden flex-col flex-1 min-h-0">
          <CardContent padding="none" className="flex flex-col flex-1 min-h-0">
            <div className="flex flex-col flex-shrink-0 gap-3 px-4 py-3 border-b sm:flex-row sm:justify-between sm:items-center border-border">
              <p className="text-sm text-muted-foreground">
                {filtered.length} of {members.length} member{members.length === 1 ? '' : 's'}
              </p>
              <SearchInput
                value={query}
                onChange={handleSearchChange}
                placeholder="Search members by name or email…"
                className="w-full sm:w-auto sm:min-w-[280px]"
              />
            </div>

            {filtered.length === 0 ? (
              <div className="flex flex-1 justify-center items-center px-4 py-10 min-h-0 text-center">
                <p className="text-sm text-muted-foreground">
                  No members match &ldquo;{query}&rdquo;.
                </p>
              </div>
            ) : (
              <div className="overflow-y-auto flex-1 min-h-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="px-4 py-2 font-medium text-left">Member</th>
                      <th className="px-4 py-2 font-medium text-left">Alliance role</th>
                      <th className="px-4 py-2 font-medium text-left">Effective roles</th>
                      <th className="px-4 py-2 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((member) => (
                    <tr key={member.userId} className="border-b border-border last:border-0 align-top">
                      <td className="px-4 py-2">
                        <div className="font-medium text-foreground">{member.name || `User #${member.userId}`}</div>
                        {member.email && <div className="text-xs text-muted-foreground">{member.email}</div>}
                      </td>
                      <td className="px-4 py-2">
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
                    <td className="px-4 py-2">
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
                    <td className="px-4 py-2 text-right">
                      <Tooltip content={`Remove ${member.name || `User #${member.userId}`} from this alliance`}>
                        <Button
                          variant="ghost"
                          onClick={() => setRemoveTarget(member)}
                          aria-label={`Remove ${member.name || member.userId}`}
                        >
                          <UserMinus className="w-4 h-4" />
                        </Button>
                      </Tooltip>
                    </td>
                  </tr>
                ))}
                  </tbody>
                </table>
              </div>
            )}

            {filtered.length > PAGE_SIZE && (
              <div className="flex-shrink-0">
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  total={filtered.length}
                  limit={PAGE_SIZE}
                  onPageChange={setPage}
                />
              </div>
            )}
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
              <Label htmlFor="alliance-add-user">User</Label>
              <ReactSelect
                id="alliance-add-user"
                value={selectedUserId}
                onChange={setSelectedUserId}
                options={userOptions}
                // Search is server-side (platform directory); only update on real typing,
                // not on blur/menu-close (which fire onInputChange with an empty value).
                onInputChange={(value, meta) => {
                  if (meta.action === 'input-change') {
                    setUserSearch(value);
                  }
                }}
                filterOption={null}
                isLoading={usersQuery.isFetching}
                placeholder="Search by name or email…"
                noOptionsMessage={() =>
                  usersQuery.isFetching
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
                value={newRole}
                onChange={(event) => setNewRole(event.target.value as AllianceRole)}
              >
                {ALLIANCE_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABEL[role]}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground">{ROLE_HELP[newRole]}</p>
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
        description="This revokes the member's sessions and reassigns their open tickets across every workspace in the alliance. Their alliance-managed roles are removed (any direct grant is preserved)."
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
            ? 'Alliance admins manage identity, provisioning, groups, members and workspaces — this grants workspace-admin access across every workspace in the alliance. Applied on the next reconcile.'
            : 'This lowers the member to alliance agent (associate) across every workspace in the alliance and may reduce their department visibility. Applied on the next reconcile.'
        }
      />
    </div>
  );
};
