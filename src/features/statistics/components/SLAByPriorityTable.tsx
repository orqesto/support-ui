import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Ticket, AlertCircle, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { DataTable, type ColumnDef } from '@/components/ui/DataTable';
import { slaService } from '@/features/statistics/services/sla.service';
import { periodKey, periodParams, type ReportPeriod } from '@/lib/reportPeriod';
import { finiteNumber } from '@/lib/finiteNumber';
import { formatDuration } from '@/lib/utils';

export const SLA_DEFAULT_DAYS = 30;

/** The priority rows of the SLA tables, in order, with their badge — shared by both tables. */
export const SLA_PRIORITIES = [
  { name: 'Critical', key: 'critical', variant: 'danger' },
  { name: 'High', key: 'high', variant: 'warning' },
  { name: 'Medium', key: 'medium', variant: 'default' },
  { name: 'Low', key: 'low', variant: 'secondary' },
] as const;

type PriorityRow = {
  key: string;
  /** Position in SLA_PRIORITIES: critical first. */
  rank: number;
  priority: string;
  variant: (typeof SLA_PRIORITIES)[number]['variant'];
  total: number;
  firstResponseTarget: number;
  avgFirstResponseValue: number | null;
  avgFirstResponse: string;
  firstResponseBreached: number;
  resolutionTargetMinutes: number | null | undefined;
  resolutionTarget: string;
  avgResolutionValue: number | null;
  avgResolution: string;
  resolutionBreached: number;
};

const breachedCell = (count: number) => (
  <span className={count > 0 ? 'text-destructive font-bold' : 'text-success font-bold'}>
    {count}
  </span>
);

const CENTER = { headerClassName: 'text-center', cellClassName: 'text-center' };
// Every column sorts from its header. The rows come in priority order (critical → low), which is
// also what a third click returns to; Priority itself sorts by that order, not alphabetically.
const columns: ColumnDef<PriorityRow>[] = [
  {
    id: 'priority',
    header: 'Priority',
    sortValue: (row) => row.rank,
    cell: (row) => <Badge variant={row.variant}>{row.priority}</Badge>,
  },
  {
    id: 'total',
    header: 'Total',
    sortValue: (row) => row.total,
    ...CENTER,
    cellClassName: 'text-center font-medium',
    cell: (row) => row.total,
  },
  {
    id: 'firstResponseTarget',
    header: 'First Response Target (min)',
    sortValue: (row) => row.firstResponseTarget,
    ...CENTER,
    cellClassName: 'text-center text-muted-foreground',
    cell: (row) => `${row.firstResponseTarget}m`,
  },
  {
    id: 'avgFirstResponse',
    header: 'Avg First Response (min)',
    sortValue: (row) => row.avgFirstResponseValue,
    ...CENTER,
    cellClassName: 'text-center font-medium',
    cell: (row) => `${row.avgFirstResponse}m`,
  },
  {
    id: 'firstResponseBreached',
    header: 'Breached',
    sortValue: (row) => row.firstResponseBreached,
    ...CENTER,
    cell: (row) => breachedCell(row.firstResponseBreached),
  },
  {
    id: 'resolutionTarget',
    header: 'Resolution Target',
    sortValue: (row) => row.resolutionTargetMinutes,
    ...CENTER,
    cellClassName: 'text-center text-muted-foreground',
    cell: (row) => row.resolutionTarget,
  },
  {
    id: 'avgResolution',
    header: 'Avg Resolution (h)',
    sortValue: (row) => row.avgResolutionValue,
    ...CENTER,
    cellClassName: 'text-center font-medium',
    cell: (row) => `${row.avgResolution}h`,
  },
  {
    id: 'resolutionBreached',
    header: 'Breached',
    sortValue: (row) => row.resolutionBreached,
    ...CENTER,
    cell: (row) => breachedCell(row.resolutionBreached),
  },
];

type SLAByPriorityTableProps = {
  days?: number;
  /** A custom window (the date picker); wins over `days`. */
  period?: ReportPeriod;
};

export const SLAByPriorityTable = ({ days = SLA_DEFAULT_DAYS, period }: SLAByPriorityTableProps) => {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['sla-statistics', { window: period ? periodKey(period) : days }],
    queryFn: () => slaService.getStatistics(period ? periodParams(period) : { days }),
  });

  // Priority order (critical → low), the order a third header click returns to. Memoised on the
  // data, so DataTable keeps one sort per answer rather than one per render.
  const tickets = data?.tickets;
  const rows = useMemo(
    () =>
      tickets
        ? SLA_PRIORITIES.flatMap((priority, rank): PriorityRow[] => {
            const stats = tickets[priority.key];
            if (!stats || stats.total === 0) return [];
            const avgFirst = finiteNumber(stats.avgFirstResponse);
            const avgResolution = finiteNumber(stats.avgResolution);
            // Minutes from a 0238 backend (a 90-minute target is 1h 30m, not 1.5h); hours before.
            const hasMinutes = typeof stats.resolutionTargetMinutes === 'number';
            return [
              {
                key: priority.key,
                rank,
                priority: priority.name,
                variant: priority.variant,
                total: stats.total,
                firstResponseTarget: stats.firstResponseTarget,
                avgFirstResponseValue: avgFirst,
                avgFirstResponse: avgFirst === null ? '—' : avgFirst.toFixed(1),
                firstResponseBreached: stats.firstResponseBreached,
                resolutionTargetMinutes: hasMinutes
                  ? stats.resolutionTargetMinutes
                  : finiteNumber(stats.resolutionTarget) === null
                    ? null
                    : stats.resolutionTarget * 60,
                resolutionTarget: hasMinutes
                  ? formatDuration(stats.resolutionTargetMinutes as number)
                  : `${stats.resolutionTarget}h`,
                avgResolutionValue: avgResolution,
                avgResolution: avgResolution === null ? '—' : avgResolution.toFixed(1),
                resolutionBreached: stats.resolutionBreached,
              },
            ];
          })
        : [],
    [tickets]
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Ticket SLA by Priority</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[300px]">
            <Loader2 className="h-8 w-8 animate-spin text-faint-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <AlertCircle className="h-10 w-10 text-destructive mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">Failed to load SLA data</p>
          <p className="text-xs text-muted-foreground mb-4">Something went wrong while fetching data</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ticket className="h-5 w-5" />
            Ticket SLA by Priority
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center h-[300px] text-center">
            <Ticket className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground font-medium mb-1">No Ticket Data</p>
            <p className="text-sm text-muted-foreground/70">
              Priority statistics will appear here once tickets are created
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Ticket className="h-5 w-5 text-muted-foreground" />
          Ticket SLA by Priority
        </CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable
          rows={rows}
          rowKey={(row) => row.key}
          columns={columns}
          pagination={{ mode: 'client', pageSize: Math.max(rows.length, 1) }}
        />
      </CardContent>
    </Card>
  );
};
