import { Fragment, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ChevronDown, ChevronRight, ScrollText } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Label } from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import { ReactSelect, type Option } from '@/components/ui/ReactSelect';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { Pagination } from '@/components/ui/Pagination';
import { ConsoleLoading } from '@/components/console/ConsoleLoading';
import { ConsolePageHeader } from '@/components/console/ConsolePageHeader';
import { CONSOLE_PAGE_SIZE as PAGE_SIZE } from '@/components/console/consoleConstants';
import { useAllianceAudit } from '@/hooks/useAllianceAudit';
import { useAllianceOrgs } from '@/hooks/useAllianceAdmin';
import type { AllianceAuditRow } from '@/services/alliance-audit.service';

/**
 * Alliance Audit log (05-09, OQ4 v1). A PURE READ over the existing per-org audit
 * rows, alliance-filtered by the BE (org ∈ alliance; the org set is derived from
 * the route param, never the header — T-05-30). This page renders + paginates.
 *
 * Mirrors the Platform console Audit page:
 *  - A searchable workspace filter (ReactSelect over the alliance's orgs) passes
 *    `organizationId` to the endpoint, which INTERSECTS it with the alliance's org
 *    set server-side (allianceAuditService.listAuditForAlliance) — a foreign org id
 *    can only narrow the read, never leak another alliance's trail.
 *  - Each row expands to reveal the `details` payload already returned with it,
 *    plus entity / entityId / actor email.
 *
 * The optional action filter is derived best-effort from the DISTINCT actions seen
 * across pages (there is no dedicated "distinct actions" endpoint). Changing either
 * filter or the page resets the expansion set and returns to page 1.
 */

/** Format an ISO timestamp for the Time column (locale date + time). */
const formatTime = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
};

/** Actor display — name, then email, then a "System" fallback for actorless events. */
const actorLabel = (row: AllianceAuditRow): string => row.actorName ?? row.actorEmail ?? 'System';

/** Pretty-print the row `details` payload for the expanded view. */
const formatDetails = (details: unknown): string => {
  if (typeof details === 'string') {
    return details;
  }
  try {
    return JSON.stringify(details, null, 2) ?? '';
  } catch {
    return '';
  }
};

const hasDetails = (details: unknown): boolean => {
  if (details === null || details === undefined) {
    return false;
  }
  if (typeof details === 'string') {
    return details.length > 0;
  }
  if (typeof details === 'object') {
    return Object.keys(details as Record<string, unknown>).length > 0;
  }
  // Primitives (number/boolean/bigint) are meaningful values worth showing.
  return true;
};

export const ConsoleAudit = () => {
  const { allianceId } = useParams();
  const numericId = allianceId ? Number(allianceId) : null;

  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const orgsQuery = useAllianceOrgs(numericId);

  const auditQuery = useAllianceAudit(numericId, {
    page,
    pageSize: PAGE_SIZE,
    action: action || undefined,
    organizationId: organizationId ? Number(organizationId) : undefined,
  });

  const pagination = auditQuery.data?.pagination;

  // Accumulate a STABLE superset of the actions we've seen across pages so applying a
  // filter (which narrows the rows to one action) doesn't collapse the option list.
  // Still best-effort v1 — a dedicated distinct-actions endpoint would make it complete.
  const [knownActions, setKnownActions] = useState<string[]>([]);
  useEffect(() => {
    const rows = auditQuery.data?.rows;
    if (!rows) {
      return;
    }
    setKnownActions((prev) => {
      const merged = new Set(prev);
      for (const row of rows) {
        merged.add(row.action);
      }
      // The union only grows; a length match means nothing new was added.
      return merged.size === prev.length ? prev : Array.from(merged).sort();
    });
  }, [auditQuery.data?.rows]);

  const workspaceOptions = useMemo<Option[]>(() => {
    const workspaces = orgsQuery.data ?? [];
    return [
      { value: '', label: 'All workspaces' },
      ...workspaces.map((workspace) => ({
        value: String(workspace.id),
        label: workspace.name,
      })),
    ];
  }, [orgsQuery.data]);

  const rows = auditQuery.data?.rows ?? [];

  // First load has no data yet; subsequent pages keep the previous page (placeholderData).
  if (auditQuery.isLoading) {
    return <ConsoleLoading />;
  }

  if (auditQuery.isError) {
    return (
      <Alert variant="danger">
        <div className="flex gap-3 justify-between items-center">
          <span>Couldn&apos;t load the audit log.</span>
          <Button variant="secondary" onClick={() => void auditQuery.refetch()}>
            Retry
          </Button>
        </div>
      </Alert>
    );
  }

  const handleActionChange = (next: string) => {
    setAction(next);
    setExpandedRows(new Set());
    setPage(1);
  };

  const handleWorkspaceChange = (next: string) => {
    setOrganizationId(next);
    setExpandedRows(new Set());
    setPage(1);
  };

  const handlePageChange = (next: number) => {
    setExpandedRows(new Set());
    setPage(next);
  };

  const toggleRow = (rowId: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-6 h-full min-h-0">
      <ConsolePageHeader
        title="Audit log"
        description="Every change across the workspaces in this alliance, newest first."
      />

      <Card className="flex overflow-hidden flex-col flex-1 min-h-0">
        <CardHeader className="flex-shrink-0">
          <CardTitle className="flex gap-2 items-center">
            <ScrollText className="w-5 h-5 text-primary" />
            Events
          </CardTitle>
          <CardDescription>
            Read-only. Events are scoped to the workspaces that belong to this alliance.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col flex-1 gap-4 min-h-0">
          <div className="flex flex-wrap flex-shrink-0 gap-3 items-end">
            <div className="min-w-[16rem]">
              <Label htmlFor="audit-workspace" className="mb-1">
                Filter by workspace
              </Label>
              <ReactSelect
                inputId="audit-workspace"
                value={organizationId}
                onChange={handleWorkspaceChange}
                options={workspaceOptions}
                isLoading={orgsQuery.isLoading}
                placeholder="All workspaces"
                isSearchable
              />
            </div>
            <div className="min-w-[14rem]">
              <Label htmlFor="audit-action" className="mb-1">
                Filter by action
              </Label>
              <Select
                id="audit-action"
                value={action}
                onChange={(event) => handleActionChange(event.target.value)}
              >
                <option value="">All actions</option>
                {knownActions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {rows.length === 0 ? (
            <p className="flex flex-1 justify-center items-center py-8 min-h-0 text-sm text-center text-muted-foreground">
              No audit events yet.
            </p>
          ) : (
            <Card padding="none" className="overflow-auto flex-1 min-h-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left text-muted-foreground">
                    <th className="px-3 py-2 w-8 font-medium" />
                    <th className="px-3 py-2 font-medium">Time</th>
                    <th className="px-3 py-2 font-medium">Actor</th>
                    <th className="px-3 py-2 font-medium">Action</th>
                    <th className="px-3 py-2 font-medium">Workspace</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const isExpanded = expandedRows.has(row.id);
                    return (
                      <Fragment key={row.id}>
                        <tr
                          className="border-t border-border align-top cursor-pointer hover:bg-muted/50"
                          onClick={() => toggleRow(row.id)}
                        >
                          <td className="px-3 py-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="p-0 w-6 h-6"
                              aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
                              aria-expanded={isExpanded}
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleRow(row.id);
                              }}
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </Button>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                            {formatTime(row.createdAt)}
                          </td>
                          <td className="px-3 py-2">{actorLabel(row)}</td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-2 items-center">
                              <Badge variant="secondary">{row.action}</Badge>
                              <span className="text-xs text-muted-foreground">{row.entity}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {row.organizationName ?? '—'}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="border-t border-border bg-muted/30">
                            <td className="px-3 py-3" />
                            <td className="px-3 py-3" colSpan={4}>
                              <div className="space-y-3">
                                <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                                  <div>
                                    <span className="text-muted-foreground">Entity: </span>
                                    <span className="font-medium text-foreground">{row.entity}</span>
                                    {row.entityId ? (
                                      <span className="text-muted-foreground"> #{row.entityId}</span>
                                    ) : null}
                                  </div>
                                  {row.actorEmail && (
                                    <div>
                                      <span className="text-muted-foreground">Actor email: </span>
                                      <span className="font-medium text-foreground">
                                        {row.actorEmail}
                                      </span>
                                    </div>
                                  )}
                                </div>
                                {hasDetails(row.details) ? (
                                  <div>
                                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                                      Details
                                    </p>
                                    <pre className="overflow-x-auto p-3 text-xs rounded-md border border-border bg-background text-foreground">
                                      {formatDetails(row.details)}
                                    </pre>
                                  </div>
                                ) : (
                                  <p className="text-xs text-muted-foreground">
                                    No additional details recorded for this event.
                                  </p>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
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
              onPageChange={handlePageChange}
              loading={auditQuery.isFetching}
            />
          </div>
        )}
      </Card>
    </div>
  );
};
