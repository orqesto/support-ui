import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, Settings2, ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Tooltip } from '@/components/ui/Tooltip';
import { roleDisplayNames, type UserRole } from '@/types/roles';
import { getButtonClasses } from '@/components/ui/Button/button.styles';
import { Select } from '@/components/ui/Select';
import { DataTable, type ColumnDef } from '@/components/ui/DataTable';
import { ConsoleLoading } from '@/components/console/ConsoleLoading';
import { ConsolePageHeader } from '@/components/console/ConsolePageHeader';
import { CONSOLE_PAGE_SIZE as PAGE_SIZE } from '@/components/console/consoleConstants';
import { usePlatformUsers } from '@/hooks/usePlatformAdmin';
import type { PlatformUserRow } from '@/services/platform.service';

/**
 * Platform console → Users. A global, cross-org user directory backed by
 * GET /api/admin/platform/users (searchable + paginated). Every per-user action —
 * profile, global role, suspend/reactivate, workspace memberships, delete — lives in one
 * "Manage user" PAGE (PlatformUserPage), so the row carries a single action rather than a
 * scattered set of controls.
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
        <Badge variant={row.role === 'admin' ? 'danger' : 'secondary'}>
          {roleDisplayNames[row.role as UserRole] ?? row.role}
        </Badge>
      ),
    },
    {
      id: 'workspaces',
      header: 'Workspaces',
      // Named, with the workspace role each membership carries, because this is the one
      // screen that sees a person across tenants. It listed a bare count, so answering
      // "where is this person and what are they there" meant opening the dialog.
      cell: (row) =>
        row.workspaces.length > 0 ? (
          <span className="flex flex-wrap gap-1">
            {row.workspaces.map((workspace) => (
              <Badge key={workspace.organizationId} variant="secondary" className="text-xs">
                {workspace.organizationName}
                <span className="ml-1 opacity-70">
                  {roleDisplayNames[workspace.role as UserRole] ?? workspace.role}
                </span>
                {workspace.idpManaged && <Lock className="ml-1 w-3 h-3" />}
              </Badge>
            ))}
          </span>
        ) : (
          <span className="text-muted-foreground">None</span>
        ),
    },
    {
      id: 'position',
      header: 'Position',
      // An empty string is as absent as null here, so `??` would print a blank cell.
      cell: (row) => (
        <span className="text-muted-foreground">{row.position?.trim() ? row.position : '—'}</span>
      ),
    },
    {
      id: 'idp',
      header: 'Identity provider',
      // The console is where a platform admin acts on an IdP problem, and it was the one
      // surface carrying no IdP signal at all. The lock mirrors the workspace list's badge;
      // the per-workspace lock above says WHICH membership the IdP owns.
      cell: (row) => {
        // Say WHICH, not just whether. `idpManaged` is true when ANY membership is owned,
        // so a flat "IdP-managed" contradicted the unlocked workspace chip two columns
        // left for anyone owned in one workspace and hand-added to another.
        const owned = row.workspaces.filter((workspace) => workspace.idpManaged).length;
        const partly = owned > 0 && owned < row.workspaces.length;
        return row.idpManaged ? (
          <Tooltip
            content={
              partly
                ? `Owned by an identity provider in ${owned} of ${row.workspaces.length} workspaces. The locked ones cannot be edited here.`
                : 'Every workspace membership of this account is owned by an identity provider.'
            }
          >
            <Badge className="flex gap-1 items-center text-xs text-amber-700 bg-amber-100 dark:bg-amber-900 dark:text-amber-300">
              <Lock className="w-3 h-3" />
              {partly ? `IdP-managed (${owned}/${row.workspaces.length})` : 'IdP-managed'}
            </Badge>
          </Tooltip>
        ) : row.role === 'admin' ? (
          <Tooltip content="An identity provider cannot provision or manage this account while it is a platform administrator. Change their platform role to User to let the connector manage them.">
            <Badge variant="secondary" className="flex gap-1 items-center text-xs">
              <ShieldAlert className="w-3 h-3" />
              Not IdP-manageable
            </Badge>
          </Tooltip>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
    },
    {
      id: 'joined',
      header: 'Joined',
      cell: (row) => (
        <span className="whitespace-nowrap text-muted-foreground">{formatDate(row.createdAt)}</span>
      ),
    },
  ];

  // Manage opens the user PAGE. A real link, so middle-click and "copy link address"
  // work; the row travels in router state so the page paints immediately, and the page
  // re-fetches by id anyway, which is what makes the URL survive a refresh or a paste.
  const rowActions = (row: PlatformUserRow) => (
    <div className="flex justify-end">
      <Link
        to={`/console/platform/users/${row.id}`}
        state={{ user: row }}
        aria-label={`Manage ${row.email}`}
        className={getButtonClasses('outline', 'sm')}
      >
        <Settings2 className="mr-1.5 w-4 h-4" />
        Manage
      </Link>
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

    </div>
  );
};
