import { useMemo, useState } from 'react';
import { Settings2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { DataTable, type ColumnDef } from '@/components/ui/DataTable';
import { ConsoleLoading } from '@/components/console/ConsoleLoading';
import { ConsolePageHeader } from '@/components/console/ConsolePageHeader';
import { EditPlatformUserModal } from '@/components/console/EditPlatformUserModal';
import { CONSOLE_PAGE_SIZE as PAGE_SIZE } from '@/components/console/consoleConstants';
import { usePlatformUsers } from '@/hooks/usePlatformAdmin';
import { useAuthStore } from '@/stores/authStore';
import type { PlatformUserRow } from '@/services/platform.service';

/**
 * Platform console → Users. A global, cross-org user directory backed by
 * GET /api/admin/platform/users (searchable + paginated). Every per-user action —
 * profile, global role, suspend/reactivate, workspace memberships, delete — lives in one
 * "Manage user" dialog (EditPlatformUserModal), so the row carries a single action rather
 * than a scattered set of controls.
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
  const [manageUser, setManageUser] = useState<PlatformUserRow | null>(null);

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
  const pagination = usersQuery.data?.pagination;
  const rows = useMemo(() => usersQuery.data?.rows ?? [], [usersQuery.data?.rows]);

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  if (usersQuery.isLoading) {
    return <ConsoleLoading />;
  }

  const columns: ColumnDef<PlatformUserRow>[] = [
    {
      id: 'name',
      header: 'Name',
      cell: (row) => (
        <span className="flex flex-wrap gap-2 items-center">
          <span className="font-medium text-foreground">{fullName(row)}</span>
          {row.disabledAt && <Badge variant="danger">Suspended</Badge>}
        </span>
      ),
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
          <span className="text-muted-foreground">
            {row.orgCount} {row.orgCount === 1 ? 'workspace' : 'workspaces'}
          </span>
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
  ];

  const rowActions = (row: PlatformUserRow) => (
    <div className="flex justify-end">
      <Button
        variant="outline"
        size="sm"
        aria-label={`Manage ${row.email}`}
        onClick={() => setManageUser(row)}
      >
        <Settings2 className="mr-1.5 w-4 h-4" />
        Manage
      </Button>
    </div>
  );

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

      <EditPlatformUserModal
        user={manageUser}
        isOpen={manageUser !== null}
        onClose={() => setManageUser(null)}
        currentUserId={currentUserId}
      />
    </div>
  );
};
