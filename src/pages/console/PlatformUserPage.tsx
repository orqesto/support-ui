import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Ban, RotateCcw, Trash2 } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { Textarea } from '@/components/ui/Textarea';
import { ConsoleLoading } from '@/components/console/ConsoleLoading';
import { ConsolePageHeader } from '@/components/console/ConsolePageHeader';
import { WorkspaceMembershipRow } from '@/components/console/WorkspaceMembershipRow';
import {
  usePlatformUser,
  useUpdatePlatformUserRole,
  useSuspendPlatformUser,
  useReactivatePlatformUser,
  useUserOrganizations,
  usePlatformWorkspaces,
} from '@/hooks/usePlatformAdmin';
import { organizationService } from '@/services/organization.service';
import { userService } from '@/services/user.service';
import { useAuthStore } from '@/stores/authStore';
import { getUserRowCapabilities } from '@/utils/userListCapabilities';
import { ORGANIZATION_ROLES, roleDisplayNames, type OrganizationRole } from '@/types/roles';
import type { GlobalRole, PlatformUserRow } from '@/services/platform.service';

/**
 * Platform console → Users → one person, as a PAGE.
 *
 * It was a dialog (EditPlatformUserModal, deleted with this change) because in August it was
 * small: a consolidation of scattered row controls over a read-only membership list. It has since grown a full
 * membership editor, IdP ownership states and three confirmations that had to open INSIDE a
 * dialog — a screen's worth of decisions with no room, no deep link and no browser history.
 * The workspace-side equivalent (EditUserPage) has been a page for the same reason.
 *
 * Every control is carried over unchanged. What is new is that the work is addressable at
 * /console/platform/users/:userId, the confirmations are no longer nested (so Escape closes
 * the confirmation, not the whole screen), and each group of decisions is its own card.
 *
 * Loading: the list hands its row over in router state for an instant first paint, and the
 * page still fetches by id — a refresh or a pasted link has no row to inherit.
 */

const GLOBAL_ROLE_OPTIONS: { value: GlobalRole; label: string }[] = [
  { value: 'user', label: 'User' },
  { value: 'admin', label: 'Global admin' },
];

const USERS_PATH = '/console/platform/users';

const fullName = (row: PlatformUserRow): string =>
  [row.firstName, row.lastName].filter(Boolean).join(' ').trim() || row.email;

const BackToUsers = () => (
  <Link
    to={USERS_PATH}
    className="inline-flex gap-1.5 items-center text-sm text-muted-foreground hover:text-foreground"
  >
    <ArrowLeft className="w-4 h-4" />
    Users
  </Link>
);

export const PlatformUserPage = () => {
  const { userId: userIdParam } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const currentUserId = useAuthStore((state) => state.user?.id);

  const parsedId = Number(userIdParam);
  const userId = Number.isFinite(parsedId) && parsedId > 0 ? parsedId : null;

  // The row the directory already had, handed over on navigation. Seeds the query so the
  // page paints at once; absent on a cold load, where the fetch is the only source.
  const seeded = (location.state as { user?: PlatformUserRow } | null)?.user;
  const userQuery = usePlatformUser(userId, seeded?.id === userId ? seeded : undefined);
  const user = userQuery.data ?? null;

  const updateRole = useUpdatePlatformUserRole();
  const suspendMutation = useSuspendPlatformUser();
  const reactivateMutation = useReactivatePlatformUser();
  const orgsQuery = useUserOrganizations(userId);
  // Full workspace directory, to offer the workspaces this user is NOT yet in for the
  // "Add to workspace" control.
  const workspacesQuery = usePlatformWorkspaces();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [position, setPosition] = useState('');
  const [role, setRole] = useState<GlobalRole>('user');
  const [savingProfile, setSavingProfile] = useState(false);

  const [suspendMode, setSuspendMode] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');
  const [roleConfirmOpen, setRoleConfirmOpen] = useState(false);
  const [reactivateConfirmOpen, setReactivateConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const [addOrgId, setAddOrgId] = useState('');
  const [addRole, setAddRole] = useState<OrganizationRole>('support');
  const [adding, setAdding] = useState(false);

  // Seed the form from the loaded person, and re-seed only when a DIFFERENT person is
  // opened. Depending on `user` itself would re-seed on every background refetch and throw
  // away whatever the admin had typed, so the dependency is deliberately the id.
  useEffect(() => {
    if (!user) return;
    setFirstName(user.firstName ?? '');
    setLastName(user.lastName ?? '');
    setPosition(user.position ?? '');
    setRole(user.role as GlobalRole);
    setSuspendMode(false);
    setSuspendReason('');
    setAddOrgId('');
    setAddRole('support');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above: the id, not the object.
  }, [user?.id]);

  if (userId === null) {
    return (
      <div className="flex flex-col gap-4">
        <BackToUsers />
        <Alert variant="danger">That user id is not valid.</Alert>
      </div>
    );
  }

  if (userQuery.isLoading) {
    return <ConsoleLoading />;
  }

  if (userQuery.isError || !user) {
    return (
      <div className="flex flex-col gap-4">
        <BackToUsers />
        <Alert variant="danger">
          <div className="flex gap-3 justify-between items-center">
            <span>This user could not be loaded — they may have been deleted.</span>
            <Button variant="secondary" size="sm" onClick={() => void userQuery.refetch()}>
              Retry
            </Button>
          </div>
        </Alert>
      </div>
    );
  }

  const caps = getUserRowCapabilities(
    'platform',
    { userId: currentUserId, isGlobalAdmin: true, canManageUsers: true, canDeleteUsers: true },
    { userId: user.id, globalRole: user.role as GlobalRole }
  );
  const isSelf = user.id === currentUserId;
  const isSuspended = Boolean(user.disabledAt);
  const roleChanged = role !== user.role;

  // The directory and the overview both count what this page can change; this person's own
  // row is refetched so the page reflects a save without a round trip through the list.
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['platform', 'users'] });
    void queryClient.invalidateQueries({ queryKey: ['platform', 'overview'] });
    void queryClient.invalidateQueries({ queryKey: ['platform', 'user', user.id] });
  };

  const refreshMemberships = () => {
    invalidate();
    void queryClient.invalidateQueries({
      queryKey: ['platform', 'user-organizations', user.id],
    });
  };

  // Workspaces the user is NOT already in — the pool for the "Add to workspace" picker.
  const memberOrgIds = new Set((orgsQuery.data ?? []).map((org) => org.id));
  const availableWorkspaces = (workspacesQuery.data?.data ?? []).filter(
    (workspace) => !memberOrgIds.has(workspace.id)
  );
  const workspaceOptions = availableWorkspaces.map((workspace) => ({
    value: String(workspace.id),
    label: workspace.name,
  }));

  const handleAddMember = async () => {
    const orgId = Number(addOrgId);
    if (!orgId) {
      return;
    }
    setAdding(true);
    try {
      await organizationService.addMember(orgId, user.id, addRole);
      refreshMemberships();
      toast.success('Added to workspace');
      setAddOrgId('');
      setAddRole('support');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add to workspace');
    } finally {
      setAdding(false);
    }
  };

  // Profile save also carries the global-role change (after its confirm) so a single
  // "Save changes" applies both. Role edits sign the user out of all sessions, so a
  // promotion/demotion is gated behind the confirm below before we reach here.
  const applyProfileAndRole = async () => {
    setSavingProfile(true);
    try {
      await userService.update(user.id, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        // '' clears a stored position deliberately; `undefined` would leave it untouched,
        // which made the empty box unable to express "remove this".
        position: position.trim(),
      });
      if (roleChanged) {
        await new Promise<void>((resolve, reject) => {
          updateRole.mutate(
            { id: user.id, role },
            { onSuccess: () => resolve(), onError: (error) => reject(error) }
          );
        });
      }
      invalidate();
      toast.success('User updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update user');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSave = () => {
    if (roleChanged && caps.canChangeGlobalRole) {
      setRoleConfirmOpen(true);
      return;
    }
    void applyProfileAndRole();
  };

  const confirmSuspend = () => {
    suspendMutation.mutate(
      { id: user.id, reason: suspendReason.trim() || undefined },
      {
        onSuccess: () => {
          invalidate();
          setSuspendMode(false);
          setSuspendReason('');
          toast.success(`${user.email} suspended`);
        },
        onError: (error: unknown) =>
          toast.error(error instanceof Error ? error.message : 'Could not suspend user'),
      }
    );
  };

  const confirmReactivate = () => {
    reactivateMutation.mutate(user.id, {
      onSuccess: () => {
        invalidate();
        setReactivateConfirmOpen(false);
        toast.success(`${user.email} reactivated`);
      },
      onError: (error: unknown) =>
        toast.error(error instanceof Error ? error.message : 'Could not reactivate user'),
    });
  };

  /** Any workspace where the identity provider owns this account's membership. */
  const idpOwnedWorkspaces = (orgsQuery.data ?? []).filter((org) => org.idpManaged);

  const confirmDelete = async () => {
    try {
      // Platform delete = full global delete across ALL workspaces (scope:'global', BE #270).
      // When the directory owns the account the API refuses unless the caller acknowledges
      // it, so the confirmation says what will happen and passes the acknowledgement.
      // Deleting here does NOT remove them from the directory, which re-creates them on the
      // next sync.
      await userService.delete(user.id, {
        scope: 'global',
        acknowledgeIdpManaged: idpOwnedWorkspaces.length > 0,
      });
      invalidate();
      setDeleteConfirmOpen(false);
      toast.success('Account deleted');
      // The subject of this page no longer exists — going back to the directory is the only
      // coherent destination.
      navigate(USERS_PATH);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete account');
    }
  };

  return (
    <div className="flex overflow-y-auto flex-col gap-4 pb-6">
      <div className="flex flex-col flex-shrink-0 gap-2">
        <BackToUsers />
        <ConsolePageHeader
          title={fullName(user)}
          description={user.email}
          actions={
            <>
              {isSuspended && <Badge variant="danger">Suspended</Badge>}
              {user.idpManaged && <Badge variant="secondary">Identity provider</Badge>}
            </>
          }
        />
      </div>

      {isSuspended && (
        <Alert variant="warning">
          This account is suspended — the user can&apos;t sign in until reactivated.
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Profile and global role</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pu-first">First name</Label>
                <Input
                  id="pu-first"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pu-last">Last name</Label>
                <Input
                  id="pu-last"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pu-email">Email</Label>
              <div id="pu-email" className="px-3 py-2 text-sm rounded-md bg-muted">
                {user.email}
              </div>
              <p className="text-xs text-muted-foreground">Email can&apos;t be changed.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pu-position">Position</Label>
              <Input
                id="pu-position"
                value={position}
                placeholder="e.g. Support Lead"
                onChange={(event) => setPosition(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pu-role">Global role</Label>
              <Select
                id="pu-role"
                value={role}
                disabled={!caps.canChangeGlobalRole}
                aria-label={`Global role for ${user.email}`}
                onChange={(event) => setRole(event.target.value as GlobalRole)}
              >
                {GLOBAL_ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground">
                {!caps.canChangeGlobalRole
                  ? "You can't change your own global role."
                  : 'Global admins have platform-wide access. Changing this signs the user out of all sessions.'}
              </p>
            </div>

            <div className="flex gap-2 justify-end pt-2 border-t border-border">
              <Button
                onClick={handleSave}
                isLoading={savingProfile || updateRole.isPending}
                // Include the pending flags in `disabled`: the DS Button computes
                // `disabled ?? isLoading`, so an explicit boolean `disabled` shortcuts the
                // isLoading fallback — without this the button stays clickable mid-save.
                disabled={!firstName.trim() || savingProfile || updateRole.isPending}
              >
                Save changes
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Workspaces</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {orgsQuery.isLoading ? (
              <div className="flex justify-center py-4">
                <Spinner />
              </div>
            ) : orgsQuery.isError ? (
              <Alert variant="danger">
                <div className="flex gap-3 justify-between items-center">
                  <span>Couldn&apos;t load workspaces.</span>
                  <Button variant="secondary" size="sm" onClick={() => void orgsQuery.refetch()}>
                    Retry
                  </Button>
                </div>
              </Alert>
            ) : (orgsQuery.data?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">
                This user doesn&apos;t belong to any workspace.
              </p>
            ) : (
              <ul className="space-y-2">
                {orgsQuery.data?.map((org) => (
                  <WorkspaceMembershipRow
                    key={org.id}
                    orgId={org.id}
                    orgName={org.name}
                    currentRole={org.role}
                    currentDepartmentIds={org.departmentIds}
                    idpManaged={org.idpManaged}
                    userId={user.id}
                    userEmail={user.email}
                    onChanged={refreshMemberships}
                  />
                ))}
              </ul>
            )}

            <div className="pt-3 space-y-2 border-t border-border">
              <Label>Add to workspace</Label>
              <div className="flex flex-wrap gap-2 items-start">
                <div className="flex-1 min-w-[180px]">
                  <ReactSelect
                    aria-label="Workspace to add"
                    value={addOrgId}
                    onChange={setAddOrgId}
                    options={workspaceOptions}
                    isDisabled={workspacesQuery.isLoading || adding}
                    placeholder={
                      workspacesQuery.isLoading ? 'Loading workspaces…' : 'Select a workspace…'
                    }
                  />
                </div>
                <Select
                  value={addRole}
                  aria-label="Role for the new workspace"
                  className="w-44"
                  disabled={adding}
                  onChange={(event) => setAddRole(event.target.value as OrganizationRole)}
                >
                  {ORGANIZATION_ROLES.map((orgRole) => (
                    <option key={orgRole} value={orgRole}>
                      {roleDisplayNames[orgRole]}
                    </option>
                  ))}
                </Select>
                <Button
                  variant="outline"
                  onClick={() => void handleAddMember()}
                  isLoading={adding}
                  disabled={!addOrgId || adding}
                >
                  Add
                </Button>
              </div>
              {workspaceOptions.length === 0 && !workspacesQuery.isLoading && (
                <p className="text-xs text-muted-foreground">
                  This user is already in every workspace.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {isSuspended ? (
              <div className="flex flex-wrap gap-3 justify-between items-center">
                <Badge variant="danger">Suspended</Badge>
                <Button variant="outline" size="sm" onClick={() => setReactivateConfirmOpen(true)}>
                  <RotateCcw className="mr-2 w-4 h-4 text-green-600" />
                  Reactivate
                </Button>
              </div>
            ) : suspendMode ? (
              <div className="space-y-2">
                <Textarea
                  id="pu-suspend-reason"
                  value={suspendReason}
                  rows={2}
                  maxLength={500}
                  placeholder="Reason (optional) — e.g. Policy violation, pending review"
                  onChange={(event) => setSuspendReason(event.target.value)}
                />
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => setSuspendMode(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={confirmSuspend}
                    isLoading={suspendMutation.isPending}
                  >
                    Confirm suspend
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-3 justify-between items-center">
                <Badge variant="default">Active</Badge>
                {!isSelf && (
                  <Button variant="outline" size="sm" onClick={() => setSuspendMode(true)}>
                    <Ban className="mr-2 w-4 h-4 text-destructive" />
                    Suspend
                  </Button>
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Suspending blocks sign-in and revokes active sessions across every workspace.
            </p>
          </div>
        </CardContent>
      </Card>

      {caps.canRemove && (
        <Card>
          <CardHeader>
            <CardTitle>Danger zone</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3 justify-between items-center">
              <span className="text-sm text-muted-foreground">
                Permanently delete this account across all workspaces.
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteConfirmOpen(true)}
                className="text-destructive hover:text-destructive hover:border-destructive/40"
              >
                <Trash2 className="mr-2 w-4 h-4" />
                Delete account
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={roleConfirmOpen}
        onOpenChange={setRoleConfirmOpen}
        onConfirm={() => {
          setRoleConfirmOpen(false);
          void applyProfileAndRole();
        }}
        variant={role === 'admin' ? 'danger' : 'warning'}
        confirmText={role === 'admin' ? 'Make global admin' : 'Revoke admin'}
        title={
          role === 'admin'
            ? `Make ${fullName(user)} a global admin?`
            : `Revoke global admin from ${fullName(user)}?`
        }
        description={
          role === 'admin'
            ? 'Global admins have full platform-wide access across every workspace. Promotion only succeeds if the user belongs to the system workspace. This signs them out of all sessions.'
            : 'This removes platform-wide access and signs them out of all sessions. They keep their per-workspace roles.'
        }
      />

      <ConfirmDialog
        open={reactivateConfirmOpen}
        onOpenChange={setReactivateConfirmOpen}
        onConfirm={confirmReactivate}
        variant="warning"
        confirmText="Reactivate"
        title={`Reactivate ${fullName(user)}'s account?`}
        description={`This restores ${user.email}'s access — they'll be able to sign in again.`}
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        onConfirm={() => void confirmDelete()}
        variant="danger"
        confirmText="Delete account"
        title={`Delete ${fullName(user)}'s account?`}
        description={
          idpOwnedWorkspaces.length > 0
            ? `This permanently deletes ${user.email}'s account and removes them from ALL workspaces across the platform. This cannot be undone. ` +
              `Your identity provider owns this account in ${idpOwnedWorkspaces.length} workspace(s) ` +
              `(${idpOwnedWorkspaces.map((org) => org.name).join(', ')}) — deleting it here does NOT ` +
              `remove it from the directory, which will re-create the account on its next sync. ` +
              `Remove them in the identity provider to make this stick.`
            : `This permanently deletes ${user.email}'s account and removes them from ALL workspaces across the platform. This cannot be undone.`
        }
      />
    </div>
  );
};
