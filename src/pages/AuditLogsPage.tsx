import { useCallback, useEffect, useState } from 'react';
import { FileText, RefreshCw, Filter, X } from 'lucide-react';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import { Layout } from '@/components/layout/Layout';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { usePermissions } from '@/hooks/usePermissions';
import { formatDate } from '@/lib/utils';
import { auditLogService } from '@/services/auditLog.service';
import { useAuditLogsStore } from '@/stores/auditLogsStore';
import { Permission } from '@/types/roles';
import { logger } from '@/lib/logger';

export const AuditLogsPage = () => {
  const { hasPermission } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const logs = useAuditLogsStore((state) => state.logs);
  const filters = useAuditLogsStore((state) => state.filters);
  const setLogs = useAuditLogsStore((state) => state.setLogs);
  const setFilters = useAuditLogsStore((state) => state.setFilters);
  const resetFilters = useAuditLogsStore((state) => state.resetFilters);

  // Local filter state
  const [localFilters, setLocalFilters] = useState({
    search: '',
    action: '',
    entity: '',
  });

  const fetchLogs = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const result = await auditLogService.getAll({
          ...filters,
          page: currentPage,
        });
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
      fetchLogs().catch((error) => {
        logger.error('Failed to fetch logs:', error);
      });
    }
  }, [canView, fetchLogs]);

  const handleRefresh = () => {
    fetchLogs(true).catch((error) => {
      logger.error('Failed to refresh logs:', error);
    });
  };

  const handleApplyFilters = () => {
    setFilters({
      ...filters,
      action: localFilters.action || undefined,
      entity: localFilters.entity || undefined,
    });
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setLocalFilters({
      search: '',
      action: '',
      entity: '',
    });
    resetFilters();
    setCurrentPage(1);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const getActionBadgeVariant = (
    action: string
  ): 'default' | 'success' | 'warning' | 'danger' | 'secondary' => {
    if (action.includes('create')) {
      return 'success';
    }
    if (action.includes('delete')) {
      return 'danger';
    }
    if (action.includes('update')) {
      return 'warning';
    }
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
        <div className="px-4 mx-auto w-full max-w-7xl flex flex-col gap-6 h-full">
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
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  setShowFilters(!showFilters);
                }}
                variant="outline"
                size="sm"
              >
                <Filter className="w-4 h-4 mr-2" />
                Filters
              </Button>
              <Button onClick={handleRefresh} disabled={refreshing} variant="outline" size="sm">
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>

          {/* Filters */}
          {showFilters && (
            <Card>
              <CardContent className="p-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <ReactSelect
                      label="Action"
                      id="action-filter"
                      value={localFilters.action}
                      onChange={(value) => {
                        setLocalFilters({ ...localFilters, action: value });
                      }}
                      options={[
                        { value: '', label: 'All Actions' },
                        { value: 'user.create', label: 'User Create' },
                        { value: 'user.update', label: 'User Update' },
                        { value: 'user.delete', label: 'User Delete' },
                        { value: 'ticket.create', label: 'Ticket Create' },
                        { value: 'message.create', label: 'Message Create' },
                        { value: 'integration.create', label: 'Integration Create' },
                        { value: 'settings.update', label: 'Settings Update' },
                      ]}
                    />
                  </div>

                  <div>
                    <ReactSelect
                      label="Entity"
                      id="entity-filter"
                      value={localFilters.entity}
                      onChange={(value) => {
                        setLocalFilters({ ...localFilters, entity: value });
                      }}
                      options={[
                        { value: '', label: 'All Entities' },
                        { value: 'user', label: 'User' },
                        { value: 'ticket', label: 'Ticket' },
                        { value: 'message', label: 'Message' },
                        { value: 'integration', label: 'Integration' },
                        { value: 'category', label: 'Category' },
                        { value: 'settings', label: 'Settings' },
                      ]}
                    />
                  </div>

                  <div className="flex gap-2 items-end">
                    <Button onClick={handleApplyFilters} size="sm" className="flex-1">
                      Apply
                    </Button>
                    <Button
                      onClick={handleClearFilters}
                      variant="outline"
                      size="sm"
                      className="flex-1"
                    >
                      <X className="w-4 h-4 mr-1" />
                      Clear
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Audit Logs Table */}
          <Card className="flex-1 flex flex-col overflow-hidden">
            <CardContent className="p-0 flex-1 flex flex-col overflow-hidden">
              {loading ? (
                <div className="p-8 text-center">
                  <div className="mx-auto mb-4 w-12 h-12 rounded-full border-b-2 animate-spin border-primary" />
                  <p className="text-muted-foreground">Loading audit logs...</p>
                </div>
              ) : logs.length === 0 ? (
                <div className="p-8 text-center">
                  <FileText className="mx-auto mb-4 w-16 h-16 text-gray-400" />
                  <h3 className="mb-2 text-lg font-semibold">No Audit Logs Found</h3>
                  <p className="text-muted-foreground">No activity recorded yet.</p>
                </div>
              ) : (
                <>
                  {/* Mobile/Tablet Card View */}
                  <div className="xl:hidden flex-1 flex flex-col overflow-hidden">
                    <div className="divide-y divide-border overflow-auto flex-1">
                      {logs.map((log) => (
                        <div key={log.id} className="p-4 transition-colors hover:bg-accent">
                          <div className="flex gap-3 items-start">
                            <div className="flex-1 min-w-0">
                              <div className="flex gap-2 flex-wrap items-center mb-2">
                                <Badge variant={getActionBadgeVariant(log.action)}>
                                  {formatAction(log.action)}
                                </Badge>
                                <Badge variant="secondary">{log.entity}</Badge>
                              </div>
                              <div className="space-y-1 text-sm">
                                <div>
                                  <span className="font-medium">Entity ID:</span> {log.entityId}
                                </div>
                                {log.userEmail && (
                                  <div>
                                    <span className="font-medium">User:</span> {log.userEmail}
                                  </div>
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
                                {log.userEmail ?? (
                                  <span className="italic text-muted-foreground">System</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <Badge variant={getActionBadgeVariant(log.action)}>
                                  {formatAction(log.action)}
                                </Badge>
                              </td>
                              <td className="px-4 py-3">
                                <Badge variant="secondary">{log.entity}</Badge>
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
                        onClick={() => {
                          handlePageChange(currentPage - 1);
                        }}
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
                        onClick={() => {
                          handlePageChange(currentPage + 1);
                        }}
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
