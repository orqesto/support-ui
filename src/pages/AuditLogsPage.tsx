import { useCallback, useEffect, useState } from 'react';
import { FileText, RefreshCw, X } from 'lucide-react';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import { Layout } from '@/components/layout/Layout';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { usePermissions } from '@/hooks/usePermissions';
import { formatDate } from '@/lib/utils';
import { auditLogService } from '@/services/auditLog.service';
import type { AuditLogFilters } from '@/services/auditLog.service';
import { organizationService } from '@/services/organization.service';
import type { OrganizationMember } from '@/services/organization.service';
import { useAuditLogsStore } from '@/stores/auditLogsStore';
import { Permission } from '@/types/roles';
import { logger } from '@/lib/logger';

const ACTION_OPTIONS = [
  { value: '', label: 'All Actions' },
  { value: 'user.create', label: 'User → Create' },
  { value: 'user.update', label: 'User → Update' },
  { value: 'user.role_change', label: 'User → Role Change' },
  { value: 'user.skills_update', label: 'User → Skills Update' },
  { value: 'user.delete', label: 'User → Delete' },
  { value: 'message.reply', label: 'Message → Reply' },
  { value: 'message.update', label: 'Message → Update' },
  { value: 'ticket.create', label: 'Ticket → Create' },
  { value: 'ticket.update', label: 'Ticket → Update' },
  { value: 'ticket.assign', label: 'Ticket → Assign' },
  { value: 'ticket.resolve', label: 'Ticket → Resolve' },
  { value: 'ticket.reopen', label: 'Ticket → Reopen' },
  { value: 'ticket.delete', label: 'Ticket → Delete' },
  { value: 'integration.create', label: 'Integration → Create' },
  { value: 'integration.update', label: 'Integration → Update' },
  { value: 'integration.delete', label: 'Integration → Delete' },
  { value: 'category.create', label: 'Category → Create' },
  { value: 'category.update', label: 'Category → Update' },
  { value: 'category.delete', label: 'Category → Delete' },
  { value: 'prompt.create', label: 'Prompt → Create' },
  { value: 'prompt.update', label: 'Prompt → Update' },
  { value: 'prompt.delete', label: 'Prompt → Delete' },
  { value: 'organization.update', label: 'Organization → Update' },
  { value: 'organization.member_add', label: 'Organization → Member Add' },
  { value: 'organization.member_remove', label: 'Organization → Member Remove' },
  { value: 'settings.update', label: 'Settings → Update' },
  { value: 'settings.routing_key_add', label: 'Settings → Routing Key Add' },
  { value: 'settings.routing_key_delete', label: 'Settings → Routing Key Delete' },
  { value: 'documentation.update', label: 'Documentation → Update' },
  { value: 'documentation.delete', label: 'Documentation → Delete' },
  { value: 'ai.auto_reply_enable', label: 'AI → Auto-reply Enable' },
  { value: 'ai.auto_reply_disable', label: 'AI → Auto-reply Disable' },
];

const ENTITY_OPTIONS = [
  { value: '', label: 'All Entities' },
  { value: 'user', label: 'User' },
  { value: 'message', label: 'Message' },
  { value: 'ticket', label: 'Ticket' },
  { value: 'integration', label: 'Integration' },
  { value: 'category', label: 'Category' },
  { value: 'organization', label: 'Organization' },
  { value: 'prompt_template', label: 'Prompt Template' },
  { value: 'kb_entry', label: 'KB Entry' },
  { value: 'kb_document', label: 'KB Document' },
  { value: 'lead_config', label: 'Lead Config' },
  { value: 'settings', label: 'Settings' },
];

const filterSelectClass =
  'h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer';

const filterInputClass =
  'h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring dark:[color-scheme:dark]';

export const AuditLogsPage = () => {
  const { hasPermission } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [userSearch, setUserSearch] = useState('');

  const logs = useAuditLogsStore((state) => state.logs);
  const filters = useAuditLogsStore((state) => state.filters);
  const setLogs = useAuditLogsStore((state) => state.setLogs);
  const setFilters = useAuditLogsStore((state) => state.setFilters);
  const resetFilters = useAuditLogsStore((state) => state.resetFilters);

  const patchFilter = (patch: Partial<AuditLogFilters>) => {
    setFilters({ ...filters, ...patch });
    setCurrentPage(1);
  };

  const activeFilterCount = [
    filters.action,
    filters.entity,
    filters.startDate,
    filters.endDate,
    filters.userId,
  ].filter(Boolean).length;

  const fetchLogs = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      try {
        const result = await auditLogService.getAll({ ...filters, page: currentPage });
        setLogs(result.logs);
        setTotalCount(result.pagination.total);
        setTotalPages(result.pagination.totalPages);
      } catch (error) {
        logger.error('Failed to fetch audit logs:', error);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [filters, currentPage, setLogs]
  );

  const canView = hasPermission(Permission.VIEW_AUDIT_LOGS);

  useEffect(() => {
    if (canView) {
      fetchLogs().catch((error) => logger.error('Failed to fetch logs:', error));
    }
  }, [canView, fetchLogs]);

  useEffect(() => {
    if (canView) {
      organizationService
        .getMembers()
        .then((data) => {
          const seen = new Set<number>();
          setMembers(data.filter((member) => !seen.has(member.userId) && seen.add(member.userId) !== undefined));
        })
        .catch(() => {});
    }
  }, [canView]);

  const handleUserSearchChange = (value: string) => {
    setUserSearch(value);
    if (!value) {
      patchFilter({ userId: undefined });
      return;
    }
    const match = members.find((member) => member.email.toLowerCase() === value.toLowerCase());
    if (match) patchFilter({ userId: match.userId });
  };

  const handleRefresh = () => {
    fetchLogs(true).catch((error) => logger.error('Failed to refresh logs:', error));
  };

  const handleClearFilters = () => {
    resetFilters();
    setUserSearch('');
    setCurrentPage(1);
  };

  // Click a user cell to populate the search input and apply the filter
  const handleClickUser = (userId: number | null, userEmail: string | null) => {
    if (!userId) return;
    patchFilter({ userId });
    setUserSearch(userEmail ?? String(userId));
  };

  // Click an action badge to filter by that action
  const handleClickAction = (action: string) => {
    patchFilter({ action });
  };

  // Click an entity badge to filter by that entity
  const handleClickEntity = (entity: string) => {
    patchFilter({ entity });
  };

  const getActionBadgeVariant = (
    action: string
  ): 'default' | 'success' | 'warning' | 'danger' | 'secondary' => {
    if (action.includes('create')) return 'success';
    if (action.includes('delete')) return 'danger';
    if (action.includes('update')) return 'warning';
    return 'default';
  };

  const formatAction = (action: string) =>
    action
      .split('.')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' → ');

  return (
    <Layout>
      <PermissionGuard permission={Permission.VIEW_AUDIT_LOGS}>
        <div className="px-4 mx-auto w-full flex flex-col gap-6 h-full">
          {/* Header */}
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
            <div>
              <h1 className="flex gap-2 items-center text-2xl font-bold">
                <FileText className="w-8 h-8" />
                Audit Logs
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                View system activity and changes ({totalCount} total)
              </p>
            </div>
            <Button onClick={handleRefresh} disabled={refreshing} variant="outline" size="sm">
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {/* Table card */}
          <Card className="flex-1 flex flex-col overflow-hidden">
            <CardContent className="p-0 flex-1 flex flex-col overflow-hidden">

              {/* Filter bar */}
              <div className="border-b px-4 py-3 flex flex-wrap gap-2 items-center bg-muted/30">
                {/* Action */}
                <select
                  value={filters.action ?? ''}
                  onChange={(event) => patchFilter({ action: event.target.value || undefined })}
                  className={filterSelectClass}
                  aria-label="Filter by action"
                >
                  {ACTION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                {/* Entity */}
                <select
                  value={filters.entity ?? ''}
                  onChange={(event) => patchFilter({ entity: event.target.value || undefined })}
                  className={filterSelectClass}
                  aria-label="Filter by entity"
                >
                  {ENTITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                {/* Date range */}
                <div className="flex items-center gap-1">
                  <input
                    type="date"
                    value={filters.startDate ?? ''}
                    max={filters.endDate ?? undefined}
                    onChange={(event) => patchFilter({ startDate: event.target.value || undefined })}
                    className={filterInputClass}
                    aria-label="From date"
                    title="From date"
                  />
                  <span className="text-xs text-muted-foreground">–</span>
                  <input
                    type="date"
                    value={filters.endDate ?? ''}
                    min={filters.startDate ?? undefined}
                    onChange={(event) => patchFilter({ endDate: event.target.value || undefined })}
                    className={filterInputClass}
                    aria-label="To date"
                    title="To date"
                  />
                </div>

                {/* User search */}
                <div className="relative">
                  <input
                    type="search"
                    list="user-search-datalist"
                    value={userSearch}
                    onChange={(event) => handleUserSearchChange(event.target.value)}
                    placeholder="Search user…"
                    className={`${filterInputClass} w-48 pr-2`}
                    aria-label="Filter by user"
                  />
                  <datalist id="user-search-datalist">
                    {members.map((member) => (
                      <option key={member.userId} value={member.email}>
                        {member.firstName} {member.lastName}
                      </option>
                    ))}
                  </datalist>
                </div>

                {/* Clear all */}
                {activeFilterCount > 0 && (
                  <button
                    onClick={handleClearFilters}
                    className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3 h-3" />
                    Clear all ({activeFilterCount})
                  </button>
                )}
              </div>

              {loading ? (
                <div className="p-8 text-center">
                  <div className="mx-auto mb-4 w-12 h-12 rounded-full border-b-2 animate-spin border-primary" />
                  <p className="text-muted-foreground">Loading audit logs...</p>
                </div>
              ) : logs.length === 0 ? (
                <div className="p-8 text-center">
                  <FileText className="mx-auto mb-4 w-16 h-16 text-gray-400" />
                  <h3 className="mb-2 text-lg font-semibold">No Audit Logs Found</h3>
                  <p className="text-muted-foreground">
                    {activeFilterCount > 0
                      ? 'No logs match the active filters.'
                      : 'No activity recorded yet.'}
                  </p>
                  {activeFilterCount > 0 && (
                    <Button onClick={handleClearFilters} variant="outline" size="sm" className="mt-4">
                      Clear filters
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  {/* Mobile/Tablet Card View */}
                  <div className="xl:hidden flex-1 flex flex-col overflow-hidden">
                    <div className="divide-y divide-border overflow-auto flex-1">
                      {logs.map((log) => (
                        <div key={log.id} className="p-4 transition-colors hover:bg-accent">
                          <div className="flex-1 min-w-0">
                            <div className="flex gap-2 flex-wrap items-center mb-2">
                              <button
                                onClick={() => handleClickAction(log.action)}
                                title="Filter by this action"
                                className="cursor-pointer"
                              >
                                <Badge variant={getActionBadgeVariant(log.action)}>
                                  {formatAction(log.action)}
                                </Badge>
                              </button>
                              <button
                                onClick={() => handleClickEntity(log.entity)}
                                title="Filter by this entity"
                                className="cursor-pointer"
                              >
                                <Badge variant="secondary">{log.entity}</Badge>
                              </button>
                            </div>
                            <div className="space-y-1 text-sm">
                              <div>
                                <span className="font-medium">Entity ID:</span> {log.entityId}
                              </div>
                              {log.userEmail && (
                                <button
                                  onClick={() => handleClickUser(log.userId, log.userEmail)}
                                  title="Filter by this user"
                                  className="text-left hover:underline text-primary cursor-pointer"
                                >
                                  {log.userEmail}
                                </button>
                              )}
                              <div className="text-xs text-muted-foreground">
                                {formatDate(log.createdAt)}
                              </div>
                              {log.details && Object.keys(log.details).length > 0 && (
                                <details className="mt-2">
                                  <summary className="text-xs cursor-pointer text-primary">
                                    Show Details
                                  </summary>
                                  <pre className="overflow-x-auto mt-2 p-2 text-xs rounded bg-muted">
                                    {JSON.stringify(log.details, null, 2)}
                                  </pre>
                                </details>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Desktop Table View */}
                  <div className="hidden xl:flex flex-col flex-1 overflow-hidden">
                    <div className="overflow-auto flex-1">
                      <table className="w-full table-auto">
                        <thead className="sticky top-0 z-10 border-b bg-muted border-border">
                          <tr>
                            <th className="px-4 py-3 text-xs font-medium tracking-wider text-left uppercase text-muted-foreground">
                              Timestamp
                            </th>
                            <th className="px-4 py-3 text-xs font-medium tracking-wider text-left uppercase text-muted-foreground">
                              User
                            </th>
                            <th className="px-4 py-3 text-xs font-medium tracking-wider text-left uppercase text-muted-foreground">
                              Action
                            </th>
                            <th className="px-4 py-3 text-xs font-medium tracking-wider text-left uppercase text-muted-foreground">
                              Entity
                            </th>
                            <th className="px-4 py-3 text-xs font-medium tracking-wider text-left uppercase text-muted-foreground">
                              Entity ID
                            </th>
                            <th className="px-4 py-3 text-xs font-medium tracking-wider text-left uppercase text-muted-foreground">
                              Details
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y bg-card divide-border">
                          {logs.map((log) => (
                            <tr key={log.id} className="transition-colors hover:bg-accent">
                              <td className="px-4 py-3 text-sm whitespace-nowrap">
                                {formatDate(log.createdAt)}
                              </td>
                              <td className="px-4 py-3 text-sm">
                                {log.userEmail ? (
                                  <button
                                    onClick={() => handleClickUser(log.userId, log.userEmail)}
                                    title="Filter by this user"
                                    className="hover:underline text-left cursor-pointer"
                                  >
                                    {log.userEmail}
                                  </button>
                                ) : (
                                  <span className="italic text-muted-foreground">System</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <button
                                  onClick={() => handleClickAction(log.action)}
                                  title="Filter by this action"
                                  className="cursor-pointer"
                                >
                                  <Badge variant={getActionBadgeVariant(log.action)}>
                                    {formatAction(log.action)}
                                  </Badge>
                                </button>
                              </td>
                              <td className="px-4 py-3">
                                <button
                                  onClick={() => handleClickEntity(log.entity)}
                                  title="Filter by this entity"
                                  className="cursor-pointer"
                                >
                                  <Badge variant="secondary">{log.entity}</Badge>
                                </button>
                              </td>
                              <td className="px-4 py-3 text-sm font-mono">{log.entityId}</td>
                              <td className="px-4 py-3 text-sm">
                                {log.details && Object.keys(log.details).length > 0 ? (
                                  <details>
                                    <summary className="cursor-pointer text-primary">View</summary>
                                    <pre className="overflow-x-auto mt-2 p-2 text-xs rounded bg-muted max-w-md">
                                      {JSON.stringify(log.details, null, 2)}
                                    </pre>
                                  </details>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex gap-2 justify-between items-center p-4 border-t">
                      <Button
                        onClick={() => setCurrentPage(currentPage - 1)}
                        disabled={currentPage === 1}
                        size="sm"
                        variant="outline"
                      >
                        Previous
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        Page {currentPage} of {totalPages}
                      </span>
                      <Button
                        onClick={() => setCurrentPage(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        size="sm"
                        variant="outline"
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </PermissionGuard>
    </Layout>
  );
};
