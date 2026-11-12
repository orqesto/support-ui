import { useQuery } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type ColumnDef } from '@/components/ui/DataTable';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { slaService, type ResolutionTotals } from '@/features/statistics/services/sla.service';
import { periodKey, periodParams, type ReportPeriod } from '@/lib/reportPeriod';
import { formatDuration } from '@/lib/utils';
import { SLA_DEFAULT_DAYS, SLA_PRIORITIES } from './SLAByPriorityTable';

type Props = {
  days?: number;
  /** A custom window (the date picker); wins over `days`. */
  period?: ReportPeriod;
};

const minutesOf = (seconds: number | null) =>
  seconds === null ? '—' : formatDuration(Math.round(seconds / 60));
const rateOf = (rate: number | null) => (rate === null ? '—' : `${rate.toFixed(1)}%`);

type Row = (typeof SLA_PRIORITIES)[number] & { stats?: ResolutionTotals };

const CENTER = { headerClassName: 'text-center', cellClassName: 'text-center' };
// Every number column sorts from its header; Priority keeps its fixed critical → low order.
const columns: ColumnDef<Row>[] = [
  {
    id: 'priority',
    header: 'Priority',
    cell: (row) => <Badge variant={row.variant}>{row.name}</Badge>,
  },
  {
    id: 'cycles',
    sortValue: (row) => row.stats?.total,
    header: 'Cycles',
    ...CENTER,
    cellClassName: 'text-center font-medium',
    cell: (row) => row.stats?.total,
  },
  {
    id: 'within',
    sortValue: (row) => row.stats?.complianceRate,
    header: 'Within target',
    ...CENTER,
    cell: (row) => rateOf(row.stats?.complianceRate ?? null),
  },
  {
    id: 'avg',
    sortValue: (row) => row.stats?.avgResolutionSeconds,
    header: 'Avg resolution',
    ...CENTER,
    cellClassName: 'text-center font-medium',
    cell: (row) => minutesOf(row.stats?.avgResolutionSeconds ?? null),
  },
  {
    id: 'breached',
    sortValue: (row) => row.stats?.breached,
    header: 'Breached',
    ...CENTER,
    cell: (row) => (
      <span
        className={
          (row.stats?.breached ?? 0) > 0 ? 'text-destructive font-bold' : 'text-success font-bold'
        }
      >
        {row.stats?.breached}
      </span>
    ),
  },
];

/**
 * Thread resolution (owner 2026-11-11/12, backend 0238): one cycle per resolve, from the first
 * unanswered customer message to resolved, against the thread's target. Shares the statistics query
 * with the ticket table (same key). Renders nothing against an older backend.
 */
export const ThreadResolutionByPriorityTable = ({ days = SLA_DEFAULT_DAYS, period }: Props) => {
  const { data } = useQuery({
    queryKey: ['sla-statistics', { window: period ? periodKey(period) : days }],
    queryFn: () => slaService.getStatistics(period ? periodParams(period) : { days }),
  });
  const resolution = data?.messages.resolution;
  if (!resolution) return null;
  const rows = SLA_PRIORITIES.map((priority) => ({
    ...priority,
    stats: resolution.byPriority[priority.key],
  })).filter((row) => row.stats && row.stats.total > 0);

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
          Thread resolution
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {rateOf(resolution.complianceRate)} resolved within target · {resolution.total} cycles ·
          median {minutesOf(resolution.medianResolutionSeconds)}
        </p>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No thread resolution data in this period yet.
          </p>
        ) : (
          <DataTable
            rows={rows}
            rowKey={(row) => row.key}
            columns={columns}
            pagination={{ mode: 'client', pageSize: Math.max(rows.length, 1) }}
          />
        )}
      </CardContent>
    </Card>
  );
};
