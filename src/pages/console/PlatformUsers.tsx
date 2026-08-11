import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Label } from '@/components/ui/Label';
import { Tooltip } from '@/components/ui/Tooltip';
import { Drawer } from '@/components/ui/Drawer';
import { Spinner } from '@/components/ui/Spinner';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SearchInput } from '@/components/ui/SearchInput';
import { Pagination } from '@/components/ui/Pagination';
import { ConsoleLoading } from '@/components/console/ConsoleLoading';
import { ConsolePageHeader } from '@/components/console/ConsolePageHeader';
import { CONSOLE_PAGE_SIZE as PAGE_SIZE } from '@/components/console/consoleConstants';
import {
  usePlatformUsers,
  useUpdatePlatformUserRole,
  useUserOrganizations,
} from '@/hooks/usePlatformAdmin';
import { useAuthStore } from '@/stores/authStore';
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

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">
      <ConsolePageHeader title="Users" description="Every user across all workspaces." />

      <Card className="flex overflow-hidden flex-col flex-1 min-h-0">
        <CardHeader className="flex-shrink-0">
          <CardTitle>Directory</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col flex-1 gap-4 min-h-0">
          <div className="flex flex-wrap flex-shrink-0 gap-3 items-end">
            <div className="w-full max-w-sm">
              <Label htmlFor="users-search" className="mb-1">
                Search
              </Label>
              <SearchInput
                value={search}
                onChange={handleSearch}
                placeholder="Search by name or email"
                showSearchButton={false}
              />
            </div>
            <div className="min-w-[10rem]">
              <Label htmlFor="users-role-filter" className="mb-1">
                Role
              </Label>
              <Select
                id="users-role-filter"
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
            <div className="min-w-[10rem]">
              <Label htmlFor="users-verified-filter" className="mb-1">
                Verified
              </Label>
              <Select
                id="users-verified-filter"
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
          </div>

          {usersQuery.isError ? (
            <Alert variant="danger">
              <div className="flex gap-3 justify-between items-center">
                <span>Couldn&apos;t load users.</span>
                <Button variant="secondary" onClick={() => void usersQuery.refetch()}>
                  Retry
                </Button>
              </div>
            </Alert>
          ) : rows.length === 0 ? (
            <p className="flex flex-1 justify-center items-center py-8 min-h-0 text-sm text-center text-muted-foreground">
              {search || roleFilter !== 'all' || verifiedFilter !== 'all'
                ? 'No users match your filters.'
                : 'No users yet.'}
            </p>
          ) : (
            <Card padding="none" className="overflow-auto flex-1 min-h-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Email</th>
                    <th className="px-3 py-2 font-medium">Role</th>
                    <th className="px-3 py-2 font-medium">Workspaces</th>
                    <th className="px-3 py-2 font-medium">Joined</th>
                    <th className="px-3 py-2 font-medium text-right">
                      <Tooltip content="Global admins have platform-wide access across every workspace. Changing a role signs the user out of all sessions.">
                        <span className="underline decoration-dotted underline-offset-2 cursor-help">
                          Global role
                        </span>
                      </Tooltip>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-border">
                      <td className="px-3 py-2 font-medium text-foreground">{fullName(row)}</td>
                      <td className="px-3 py-2">
                        <span className="flex gap-2 items-center text-muted-foreground">
                          {row.email}
                          {!row.emailVerified && (
                            <Badge variant="warning">unverified</Badge>
                          )}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={row.role === 'admin' ? 'danger' : 'secondary'}>
                          {row.role}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        {row.orgCount > 0 ? (
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
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        {formatDate(row.createdAt)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end">
                          {row.id === currentUserId ? (
                            // Self-lockout guard: the BE rejects a caller changing their own
                            // global role (403). Mirror it here — disable the control and say why.
                            <Tooltip content="You can't change your own global role.">
                              <div className="w-40">
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
                            <div className="w-40">
                              <Select
                                value={row.role}
                                aria-label={`Global role for ${row.email}`}
                                // Server-controlled value with no optimistic update: disable this
                                // row while its change is in flight so it can't visibly revert.
                                disabled={
                                  updateRole.isPending && updateRole.variables?.id === row.id
                                }
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
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </CardContent>
        {pagination && pagination.totalPages > 1 && (
          <div className="flex-shrink-0">
            <Pagination
              currentPage={pagination.page}
              totalPages={pagination.totalPages}
              total={pagination.total}
              limit={pagination.limit}
              onPageChange={setPage}
              loading={usersQuery.isFetching}
            />
          </div>
        )}
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
    </div>
  );
};
