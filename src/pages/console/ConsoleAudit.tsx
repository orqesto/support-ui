import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ScrollText } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Label } from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import { Pagination } from '@/components/ui/Pagination';
import { useAllianceAudit } from '@/hooks/useAllianceAudit';
import type { AllianceAuditRow } from '@/services/alliance-audit.service';

/**
 * Alliance Audit log (05-09, OQ4 v1). A PURE READ over the existing per-org audit
 * rows, alliance-filtered by the BE (org ∈ alliance; the org set is derived from
 * the route param, never the header — T-05-30). This page only renders + paginates.
 *
 * The optional action filter is derived from the DISTINCT actions on the current
 * page (a lightweight v1 — there is no dedicated "distinct actions" endpoint). It
 * resets the page to 1 on change so the filtered read starts from the top.
 */

const PAGE_SIZE = 25;

/** Format an ISO timestamp for the Time column (locale date + time). */
const formatTime = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
};

/** Actor display — name, then email, then a "System" fallback for actorless events. */
const actorLabel = (row: AllianceAuditRow): string => row.actorName ?? row.actorEmail ?? 'System';

export const ConsoleAudit = () => {
  const { allianceId } = useParams();
  const numericId = allianceId ? Number(allianceId) : null;

  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');

  const auditQuery = useAllianceAudit(numericId, {
    page,
    pageSize: PAGE_SIZE,
    action: action || undefined,
  });

  const pagination = auditQuery.data?.pagination;

  // Distinct actions on the current page — a small, cheap filter source (v1).
  const actionOptions = useMemo(() => {
    const distinct = new Set((auditQuery.data?.rows ?? []).map((row) => row.action));
    return Array.from(distinct).sort();
  }, [auditQuery.data?.rows]);

  const rows = auditQuery.data?.rows ?? [];

  // First load has no data yet; subsequent pages keep the previous page (placeholderData).
  if (auditQuery.isLoading) {
    return <Spinner size={20} />;
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
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          Every change across the organizations in this alliance, newest first.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex gap-2 items-center">
            <ScrollText className="w-5 h-5 text-primary" />
            Events
          </CardTitle>
          <CardDescription>
            Read-only. Events are scoped to the organizations that belong to this alliance.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Action filter — optional; derived from the actions on the current page. */}
          <div className="flex flex-wrap gap-3 items-end">
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
                {actionOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {rows.length === 0 ? (
            <p className="py-8 text-sm text-center text-muted-foreground">No audit events yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Time</th>
                    <th className="px-3 py-2 font-medium">Actor</th>
                    <th className="px-3 py-2 font-medium">Action</th>
                    <th className="px-3 py-2 font-medium">Organization</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-border align-top">
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
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
        {pagination && pagination.totalPages > 1 && (
          <Pagination
            currentPage={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            limit={pagination.limit}
            onPageChange={setPage}
            loading={auditQuery.isFetching}
          />
        )}
      </Card>
    </div>
  );
};
