import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Ban, RotateCcw, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogContent,
  DialogFooter,
} from '@/components/ui/Dialog';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { Textarea } from '@/components/ui/Textarea';
import { WorkspaceMembershipRow } from '@/components/console/WorkspaceMembershipRow';
import {
  useUpdatePlatformUserRole,
  useSuspendPlatformUser,
  useReactivatePlatformUser,
  useUserOrganizations,
  usePlatformWorkspaces,
} from '@/hooks/usePlatformAdmin';
import { organizationService } from '@/services/organization.service';
import { userService } from '@/services/user.service';
import { getUserRowCapabilities } from '@/utils/userListCapabilities';
import { ORGANIZATION_ROLES, roleDisplayNames, type OrganizationRole } from '@/types/roles';
import type { GlobalRole, PlatformUserRow } from '@/services/platform.service';

/**
 * Platform console → Users → one consolidated "Manage user" dialog. Replaces the former
 * scattered controls (a global-role Select in its own column + loose edit/suspend/delete
 * icon buttons + a separate workspaces drawer) with a single dialog that gathers every
 * per-user action: profile, GLOBAL role, suspend/reactivate, workspace memberships (a full
 * editor — per-workspace role, departments, add/remove — see WorkspaceMembershipRow), and
 * account deletion.
 */

const GLOBAL_ROLE_OPTIONS: { value: GlobalRole; label: string }[] = [
  { value: 'user', label: 'User' },
  { value: 'admin', label: 'Global admin' },
];

const fullName = (row: PlatformUserRow): string =>
  [row.firstName, row.lastName].filter(Boolean).join(' ').trim() || '—';

type Props = {
  user: PlatformUserRow | null;
  isOpen: boolean;
  onClose: () => void;
  /** The signed-in admin's id — drives the self-lockout guards (can't demote/suspend self). */
  currentUserId: number | undefined;
};

export const EditPlatformUserModal = ({ user, isOpen, onClose, currentUserId }: Props) => {
  const queryClient = useQueryClient();
  const updateRole = useUpdatePlatformUserRole();
  const suspendMutation = useSuspendPlatformUser();
  const reactivateMutation = useReactivatePlatformUser();
  const orgsQuery = useUserOrganizations(isOpen ? (user?.id ?? null) : null);
  // Full workspace directory, to offer the workspaces this user is NOT yet in for the
  // "Add to workspace" control. Only fetched while the modal is open.
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

  // "Add to workspace" control (bottom of the Workspaces section).
  const [addOrgId, setAddOrgId] = useState('');
  const [addRole, setAddRole] = useState<OrganizationRole>('support');
  const [adding, setAdding] = useState(false);

  // Reset the form whenever a different user is opened.
  useEffect(() => {
    if (user) {
      setFirstName(user.firstName ?? '');
      setLastName(user.lastName ?? '');
      setPosition('');
      setRole(user.role as GlobalRole);
      setSuspendMode(false);
      setSuspendReason('');
      setAddOrgId('');
      setAddRole('support');
    }
  }, [user]);

  if (!user) {
    return null;
  }

  const caps = getUserRowCapabilities(
    'platform',
    { userId: currentUserId, isGlobalAdmin: true, canManageUsers: true, canDeleteUsers: true },
    { userId: user.id, globalRole: user.role as GlobalRole }
  );
  const isSelf = user.id === currentUserId;
  const isSuspended = Boolean(user.disabledAt);
  const roleChanged = role !== user.role;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['platform', 'users'] });
    void queryClient.invalidateQueries({ queryKey: ['platform', 'overview'] });
  };

  // After any membership change (add/remove/role/departments), refresh the platform users
  // list AND this user's memberships so both the directory and this modal reflect it.
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
        position: position.trim() || undefined,
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
      onClose();
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
          toast.success(`${user.email} suspended`);
          onClose();
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
        toast.success(`${user.email} reactivated`);
        setReactivateConfirmOpen(false);
        onClose();
      },
      onError: (error: unknown) =>
        toast.error(error instanceof Error ? error.message : 'Could not reactivate user'),
    });
  };

  const confirmDelete = async () => {
    try {
      // Platform delete = full global delete across ALL workspaces (scope:'global', BE #270).
      await userService.delete(user.id, { scope: 'global' });
      invalidate();
      toast.success('Account deleted');
      setDeleteConfirmOpen(false);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete account');
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogHeader>
          <DialogTitle>Manage user — {user.email}</DialogTitle>
          <DialogClose onClose={onClose} />
        </DialogHeader>
        <DialogContent>
          <div className="space-y-5">
            {isSuspended && (
              <Alert variant="warning">
                This account is suspended — the user can&apos;t sign in until reactivated.
              </Alert>
            )}

            {/* Profile */}
            <div className="space-y-3">
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
                <div className="px-3 py-2 text-sm rounded-md bg-muted">{user.email}</div>
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
            </div>

            {/* Global role */}
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

            {/* Workspace memberships (editable) */}
            <div className="space-y-1.5">
              <Label>Workspaces</Label>
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
                      userId={user.id}
                      userEmail={user.email}
                      onChanged={refreshMemberships}
                    />
                  ))}
                </ul>
              )}

              {/* Add to workspace */}
              <div className="pt-3 space-y-2">
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

            {/* Account status: suspend / reactivate */}
            <div className="pt-4 space-y-2 border-t border-border">
              <Label>Account status</Label>
              {isSuspended ? (
                <div className="flex flex-wrap gap-3 justify-between items-center">
                  <Badge variant="danger">Suspended</Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setReactivateConfirmOpen(true)}
                  >
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

            {/* Danger zone: delete */}
            {caps.canRemove && (
              <div className="pt-4 space-y-2 border-t border-border">
                <Label>Danger zone</Label>
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
              </div>
            )}
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={savingProfile}>
            Close
          </Button>
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
        </DialogFooter>
      </Dialog>

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
        description={`This permanently deletes ${user.email}'s account and removes them from ALL workspaces across the platform. This cannot be undone.`}
      />
    </>
  );
};
