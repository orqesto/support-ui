import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { SearchInput } from '@/components/ui/SearchInput';
import { Pagination } from '@/components/ui/Pagination';
import { ConsoleLoading } from '@/components/console/ConsoleLoading';
import { usePlatformUsers } from '@/hooks/usePlatformAdmin';
import type { PlatformUserRow } from '@/services/platform.service';

/**
 * Platform console → Users. A global, cross-org user directory backed by the new
 * GET /api/admin/platform/users endpoint (the org `/api/users` handler is org-scoped
 * and has no all-users branch). Searchable + paginated, read-only in this slice.
 */

const PAGE_SIZE = 25;

const fullName = (row: PlatformUserRow): string =>
  [row.firstName, row.lastName].filter(Boolean).join(' ').trim() || '—';

const formatDate = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString();
};

export const PlatformUsers = () => {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const usersQuery = usePlatformUsers({ page, pageSize: PAGE_SIZE, search: search || undefined });
  const pagination = usersQuery.data?.pagination;
  const rows = usersQuery.data?.rows ?? [];

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Users</h1>
        <p className="text-sm text-muted-foreground">Every user across all workspaces.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Directory</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-sm">
            <SearchInput
              value={search}
              onChange={handleSearch}
              placeholder="Search by name or email"
              showSearchButton={false}
            />
          </div>

          {usersQuery.isLoading ? (
            <ConsoleLoading />
          ) : usersQuery.isError ? (
            <Alert variant="danger">
              <div className="flex gap-3 justify-between items-center">
                <span>Couldn&apos;t load users.</span>
                <Button variant="secondary" onClick={() => void usersQuery.refetch()}>
                  Retry
                </Button>
              </div>
            </Alert>
          ) : rows.length === 0 ? (
            <p className="py-8 text-sm text-center text-muted-foreground">
              {search ? 'No users match your search.' : 'No users yet.'}
            </p>
          ) : (
            <Card padding="none" className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Email</th>
                    <th className="px-3 py-2 font-medium">Role</th>
                    <th className="px-3 py-2 font-medium">Workspaces</th>
                    <th className="px-3 py-2 font-medium">Joined</th>
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
                      <td className="px-3 py-2 text-muted-foreground">{row.orgCount}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        {formatDate(row.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </CardContent>
        {pagination && pagination.totalPages > 1 && (
          <Pagination
            currentPage={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            limit={pagination.limit}
            onPageChange={setPage}
            loading={usersQuery.isFetching}
          />
        )}
      </Card>
    </div>
  );
};
