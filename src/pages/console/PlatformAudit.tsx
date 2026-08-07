import { useEffect, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Label } from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { Pagination } from '@/components/ui/Pagination';
import { ConsoleLoading } from '@/components/console/ConsoleLoading';
import { usePlatformAudit } from '@/hooks/usePlatformAdmin';
import type { PlatformAuditRow } from '@/services/platform.service';

/**
 * Platform console → Audit. A cross-org audit feed backed by GET /api/admin/platform/audit
 * (the alliance audit read with the alliance org-set restriction dropped — a global admin
 * sees every org's trail). Read-only + paginated. The action filter is derived best-effort
 * from the actions seen across pages (no dedicated distinct-actions endpoint).
 */

const PAGE_SIZE = 25;

const formatTime = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
};

const actorLabel = (row: PlatformAuditRow): string => row.actorName ?? row.actorEmail ?? 'System';

export const PlatformAudit = () => {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');

  const auditQuery = usePlatformAudit({
    page,
    pageSize: PAGE_SIZE,
    action: action || undefined,
  });

  const pagination = auditQuery.data?.pagination;

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
      return merged.size === prev.length ? prev : Array.from(merged).sort();
    });
  }, [auditQuery.data?.rows]);

  const rows = auditQuery.data?.rows ?? [];

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
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          Every change across every organization on the platform, newest first.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex gap-2 items-center">
            <ScrollText className="w-5 h-5 text-primary" />
            Events
          </CardTitle>
          <CardDescription>Read-only. Spans all organizations.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
                {knownActions.map((option) => (
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
            <Card padding="none" className="overflow-x-auto">
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
            loading={auditQuery.isFetching}
          />
        )}
      </Card>
    </div>
  );
};
