import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Pencil, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Dialog, DialogHeader, DialogTitle, DialogContent } from '@/components/ui/Dialog';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Label } from '@/components/ui/Label';
import { Tooltip } from '@/components/ui/Tooltip';
import { Drawer } from '@/components/ui/Drawer';
import { Spinner } from '@/components/ui/Spinner';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type ColumnDef } from '@/components/ui/DataTable';
import { ConsoleLoading } from '@/components/console/ConsoleLoading';
import { ConsolePageHeader } from '@/components/console/ConsolePageHeader';
import { CONSOLE_PAGE_SIZE as PAGE_SIZE } from '@/components/console/consoleConstants';
import {
  usePlatformUsers,
  useUpdatePlatformUserRole,
  useUserOrganizations,
} from '@/hooks/usePlatformAdmin';
import { useAuthStore } from '@/stores/authStore';
import { userService } from '@/services/user.service';
import { getUserRowCapabilities } from '@/utils/userListCapabilities';
import type { GlobalRole, PlatformUserRow } from '@/services/platform.service';

/**
 * Platform console → Users. A global, cross-org user directory backed by the
 * GET /api/admin/platform/users endpoint (the org `/api/users` handler is org-scoped
 * and has no all-users branch). Searchable + paginated. Global-role editing is done
 * here (PATCH .../role) — the platform console is the home for global-admin management.
 */

/**
 * The only mutation the platform backend exposes for a user is the GLOBAL role
 * (PATCH /api/admin/platform/users/:id/role, roles: admin | user). There is no
 * platform-scoped deactivate / suspend / delete / profile-edit endpoint, so no other
 * per-user action is offered here — a dead button would be worse than none.
 */
const GLOBAL_ROLE_OPTIONS: { value: GlobalRole; label: string }[] = [
  { value: 'user', label: 'User' },
  { value: 'admin', label: 'Global admin' },
];

/** A pending global-role change awaiting confirmation. */
type PendingRoleChange = { id: number; email: string; nextRole: GlobalRole };

/**
 * Role / Verified filters. Applied SERVER-SIDE (passed to GET /platform/users) so they
 * span the whole directory and the pagination total reflects the filtered set — not just
 * the current page (a page-local filter used to read as empty when matches sat on a later page).
 */
type RoleFilter = 'all' | 'admin' | 'user';
type VerifiedFilter = 'all' | 'verified' | 'unverified';

const ROLE_FILTER_OPTIONS: { value: RoleFilter; label: string }[] = [
  { value: 'all', label: 'All roles' },
  { value: 'admin', label: 'Global admin' },
  { value: 'user', label: 'User' },
];

const VERIFIED_FILTER_OPTIONS: { value: VerifiedFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'verified', label: 'Verified' },
  { value: 'unverified', label: 'Unverified' },
];

const fullName = (row: PlatformUserRow): string =>
  [row.firstName, row.lastName].filter(Boolean).join(' ').trim() || '—';

const formatDate = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString();
};

export const PlatformUsers = () => {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [verifiedFilter, setVerifiedFilter] = useState<VerifiedFilter>('all');
  const [pending, setPending] = useState<PendingRoleChange | null>(null);
  const [drawerUser, setDrawerUser] = useState<PlatformUserRow | null>(null);
  const [editUser, setEditUser] = useState<PlatformUserRow | null>(null);
  const [editForm, setEditForm] = useState({ firstName: '', lastName: '', position: '' });
  const [deleteUser, setDeleteUser] = useState<PlatformUserRow | null>(null);

  const currentUserId = useAuthStore((state) => state.user?.id);
  const usersQuery = usePlatformUsers({
    page,
    pageSize: PAGE_SIZE,
    search: search || undefined,
    // Role/Verified are applied server-side so they span the whole directory, not just the
    // current page (a page-local filter made "Role = Admin" read as empty when admins sat later).
    role: roleFilter === 'all' ? undefined : roleFilter,
    verified: verifiedFilter === 'all' ? undefined : verifiedFilter,
  });
  const updateRole = useUpdatePlatformUserRole();
  const pagination = usersQuery.data?.pagination;
  const rows = useMemo(() => usersQuery.data?.rows ?? [], [usersQuery.data?.rows]);

  const drawerOrgsQuery = useUserOrganizations(drawerUser?.id ?? null);

  const queryClient = useQueryClient();
  const invalidateUsers = () => {
    void queryClient.invalidateQueries({ queryKey: ['platform', 'users'] });
    void queryClient.invalidateQueries({ queryKey: ['platform', 'overview'] });
  };

  // Profile edit + account delete reuse the GLOBAL-admin paths on /api/users/:id:
  // updateUser skips the org-context guard for admins (writes name/position to the users
  // row), and deleteUser hard-deletes the account for admins. Gating comes from
  // userListCapabilities (platform scope). See SHARED-TABLE plan / §5.
  const editMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: { firstName?: string; lastName?: string; position?: string };
    }) => userService.update(id, data),
    onSuccess: () => {
      invalidateUsers();
      toast.success('Profile updated');
      setEditUser(null);
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : 'Could not update profile'),
  });
  const deleteMutation = useMutation({
    // Platform console "Delete account" = full global delete across ALL workspaces
    // (the dialog says so). Must pass scope:'global' or BE #270 scopes a multi-workspace
    // user to just the current workspace's membership. Workspace UsersPage stays unscoped.
    mutationFn: (id: number) => userService.delete(id, { scope: 'global' }),
    onSuccess: () => {
      invalidateUsers();
      toast.success('Account deleted');
      setDeleteUser(null);
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : 'Could not delete account'),
  });

  const openEdit = (user: PlatformUserRow) => {
    setEditForm({ firstName: user.firstName ?? '', lastName: user.lastName ?? '', position: '' });
    setEditUser(user);
  };
  const handleEditSave = () => {
    if (!editUser) {
      return;
    }
    editMutation.mutate({
      id: editUser.id,
      data: {
        firstName: editForm.firstName.trim(),
        lastName: editForm.lastName.trim(),
        position: editForm.position.trim(),
      },
    });
  };

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const confirmRoleChange = () => {
    if (!pending) {
      return;
    }
    updateRole.mutate(
      { id: pending.id, role: pending.nextRole },
      {
        onSuccess: (updated) => {
          toast.success(
            `${pending.email} is now ${updated.role === 'admin' ? 'a global admin' : 'a regular user'}.`
          );
          setPending(null);
        },
        onError: (error: unknown) =>
          toast.error(error instanceof Error ? error.message : 'Could not update role'),
      }
    );
  };

  // Full-section loader as an early return, matching every other console page
  // (previously rendered inside the Card body, leaving the filters mounted).
  if (usersQuery.isLoading) {
    return <ConsoleLoading />;
  }

  const rowCaps = (row: PlatformUserRow) =>
    getUserRowCapabilities(
      'platform',
      { userId: currentUserId, isGlobalAdmin: true, canManageUsers: true, canDeleteUsers: true },
      { userId: row.id, globalRole: row.role as GlobalRole }
    );

  const columns: ColumnDef<PlatformUserRow>[] = [
    {
      id: 'name',
      header: 'Name',
      cell: (row) => <span className="font-medium text-foreground">{fullName(row)}</span>,
    },
    {
      id: 'email',
      header: 'Email',
      cell: (row) => (
        <span className="flex gap-2 items-center text-muted-foreground">
          {row.email}
          {!row.emailVerified && <Badge variant="warning">unverified</Badge>}
        </span>
      ),
    },
    {
      id: 'role',
      header: 'Role',
      cell: (row) => (
        <Badge variant={row.role === 'admin' ? 'danger' : 'secondary'}>{row.role}</Badge>
      ),
    },
    {
      id: 'workspaces',
      header: 'Workspaces',
      cell: (row) =>
        row.orgCount > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            className="px-2 h-8 underline decoration-dotted underline-offset-2"
            onClick={() => setDrawerUser(row)}
          >
            {row.orgCount} {row.orgCount === 1 ? 'workspace' : 'workspaces'}
          </Button>
        ) : (
          <span className="text-muted-foreground">0</span>
        ),
    },
    {
      id: 'joined',
      header: 'Joined',
      cell: (row) => (
        <span className="whitespace-nowrap text-muted-foreground">{formatDate(row.createdAt)}</span>
      ),
    },
    {
      id: 'globalRole',
      align: 'right',
      header: (
        <Tooltip content="Global admins have platform-wide access across every workspace. Changing a role signs the user out of all sessions.">
          <span className="underline decoration-dotted underline-offset-2 cursor-help">
            Global role
          </span>
        </Tooltip>
      ),
      cell: (row) =>
        !rowCaps(row).canChangeGlobalRole ? (
          // Self-lockout guard: the BE rejects a caller changing their own global role (403).
          <Tooltip content="You can't change your own global role.">
            <div className="ml-auto w-40">
              <Select value={row.role} disabled aria-label="Global role">
                {GLOBAL_ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
          </Tooltip>
        ) : (
          <div className="ml-auto w-40">
            <Select
              value={row.role}
              aria-label={`Global role for ${row.email}`}
              // Server-controlled value with no optimistic update: disable this row while its
              // change is in flight so it can't visibly revert.
              disabled={updateRole.isPending && updateRole.variables?.id === row.id}
              onChange={(event) => {
                const nextRole = event.target.value as GlobalRole;
                if (nextRole !== row.role) {
                  setPending({ id: row.id, email: row.email, nextRole });
                }
              }}
            >
              {GLOBAL_ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
        ),
    },
  ];

  const rowActions = (row: PlatformUserRow) => {
    const caps = rowCaps(row);
    return (
      <div className="flex gap-1 justify-end">
        {caps.canEdit && (
          <Tooltip content={`Edit ${row.email}`}>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Edit ${row.email}`}
              onClick={() => openEdit(row)}
            >
              <Pencil className="w-4 h-4" />
            </Button>
          </Tooltip>
        )}
        {caps.canRemove && (
          <Tooltip content={`Delete ${row.email}'s account`}>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Delete ${row.email}`}
              onClick={() => setDeleteUser(row)}
            >
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          </Tooltip>
        )}
      </div>
    );
  };

  // Wrap each filter in a fixed-width box: the DS Select is full-width, so bare in the
  // flex toolbar the two would each span 100% and stack. The width box keeps them inline.
  const roleFilterControl = (
    <div className="w-44">
      <Select
        aria-label="Filter by role"
        value={roleFilter}
        onChange={(event) => {
          setRoleFilter(event.target.value as RoleFilter);
          setPage(1);
        }}
      >
        {ROLE_FILTER_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </div>
  );

  const verifiedFilterControl = (
    <div className="w-44">
      <Select
        aria-label="Filter by verification"
        value={verifiedFilter}
        onChange={(event) => {
          setVerifiedFilter(event.target.value as VerifiedFilter);
          setPage(1);
        }}
      >
        {VERIFIED_FILTER_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </div>
  );

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">
      <ConsolePageHeader title="Users" description="Every user across all workspaces." />

      <Card className="flex overflow-hidden flex-col flex-1 min-h-0">
        <CardHeader className="flex-shrink-0">
          <CardTitle>Directory</CardTitle>
        </CardHeader>
        <CardContent padding="none" className="flex overflow-hidden flex-col flex-1 min-h-0">
          <DataTable
            rows={rows}
            rowKey={(row) => row.id}
            columns={columns}
            actions={rowActions}
            toolbarStart={
              <>
                {roleFilterControl}
                {verifiedFilterControl}
              </>
            }
            search={{
              value: search,
              onChange: handleSearch,
              placeholder: 'Search by name or email',
              showButton: false,
            }}
            pagination={{
              mode: 'server',
              page: pagination?.page ?? 1,
              totalPages: pagination?.totalPages ?? 1,
              total: pagination?.total ?? 0,
              limit: pagination?.limit ?? PAGE_SIZE,
              onPageChange: setPage,
              loading: usersQuery.isFetching,
            }}
            isError={usersQuery.isError}
            onRetry={() => void usersQuery.refetch()}
            empty={{ message: 'No users yet.', filteredMessage: 'No users match your filters.' }}
          />
        </CardContent>
      </Card>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPending(null);
          }
        }}
        onConfirm={confirmRoleChange}
        variant={pending?.nextRole === 'admin' ? 'danger' : 'warning'}
        confirmText={pending?.nextRole === 'admin' ? 'Make global admin' : 'Revoke admin'}
        title={
          pending?.nextRole === 'admin'
            ? `Make ${pending?.email ?? 'this user'} a global admin?`
            : `Revoke global admin from ${pending?.email ?? 'this user'}?`
        }
        description={
          pending?.nextRole === 'admin'
            ? 'Global admins have full platform-wide access across every workspace. Promotion only succeeds if the user belongs to the system workspace. This signs them out of all sessions.'
            : 'This removes platform-wide access and signs them out of all sessions. They keep their per-workspace roles.'
        }
      />

      <Drawer
        open={drawerUser !== null}
        onClose={() => setDrawerUser(null)}
        title={drawerUser ? `${fullName(drawerUser)} — workspaces` : 'Workspaces'}
      >
        {drawerUser && (
          <p className="mb-4 text-sm text-muted-foreground">{drawerUser.email}</p>
        )}
        {drawerOrgsQuery.isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : drawerOrgsQuery.isError ? (
          <Alert variant="danger">
            <div className="flex gap-3 justify-between items-center">
              <span>Couldn&apos;t load workspaces.</span>
              <Button variant="secondary" onClick={() => void drawerOrgsQuery.refetch()}>
                Retry
              </Button>
            </div>
          </Alert>
        ) : (drawerOrgsQuery.data?.length ?? 0) === 0 ? (
          <p className="py-8 text-sm text-center text-muted-foreground">
            This user doesn&apos;t belong to any workspace.
          </p>
        ) : (
          <ul className="space-y-2">
            {drawerOrgsQuery.data?.map((org) => (
              <li
                key={org.id}
                className="flex gap-3 justify-between items-center p-3 rounded-md border border-border"
              >
                <span className="text-sm font-medium text-foreground">{org.name}</span>
                <Badge variant="secondary">{org.role}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Drawer>

      <Dialog
        open={editUser !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditUser(null);
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Edit profile{editUser ? ` — ${editUser.email}` : ''}</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="platform-edit-first">First name</Label>
                <Input
                  id="platform-edit-first"
                  value={editForm.firstName}
                  onChange={(event) =>
                    setEditForm((form) => ({ ...form, firstName: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="platform-edit-last">Last name</Label>
                <Input
                  id="platform-edit-last"
                  value={editForm.lastName}
                  onChange={(event) =>
                    setEditForm((form) => ({ ...form, lastName: event.target.value }))
                  }
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="platform-edit-position">Position</Label>
              <Input
                id="platform-edit-position"
                value={editForm.position}
                placeholder="e.g. Support Lead"
                onChange={(event) =>
                  setEditForm((form) => ({ ...form, position: event.target.value }))
                }
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Edits the user&apos;s global profile. Their role and departments within a specific
              workspace are managed from that workspace (Workspaces → Manage).
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setEditUser(null)}>
                Cancel
              </Button>
              <Button
                onClick={handleEditSave}
                isLoading={editMutation.isPending}
                disabled={!editForm.firstName.trim() || editMutation.isPending}
              >
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteUser !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteUser(null);
          }
        }}
        onConfirm={() => {
          if (deleteUser) {
            deleteMutation.mutate(deleteUser.id);
          }
        }}
        variant="danger"
        confirmText="Delete account"
        title={`Delete ${deleteUser ? fullName(deleteUser) : 'this'} account?`}
        description={`This permanently deletes ${deleteUser?.email ?? 'this user'}'s account and removes them from ALL workspaces across the platform. This cannot be undone.`}
      />
    </div>
  );
};
