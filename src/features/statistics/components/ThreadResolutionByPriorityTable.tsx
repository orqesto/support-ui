import { useQuery } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { slaService } from '@/features/statistics/services/sla.service';
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left py-3 px-3 font-semibold">Priority</th>
                  <th className="text-center py-3 px-3 font-semibold">Cycles</th>
                  <th className="text-center py-3 px-3 font-semibold">Within target</th>
                  <th className="text-center py-3 px-3 font-semibold">Avg resolution</th>
                  <th className="text-center py-3 px-3 font-semibold">Breached</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.key}
                    className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="py-3 px-3">
                      <Badge variant={row.variant}>{row.name}</Badge>
                    </td>
                    <td className="text-center py-3 px-3 font-medium">{row.stats?.total}</td>
                    <td className="text-center py-3 px-3">
                      {rateOf(row.stats?.complianceRate ?? null)}
                    </td>
                    <td className="text-center py-3 px-3 font-medium">
                      {minutesOf(row.stats?.avgResolutionSeconds ?? null)}
                    </td>
                    <td className="text-center py-3 px-3">
                      <span
                        className={
                          (row.stats?.breached ?? 0) > 0
                            ? 'text-destructive font-bold'
                            : 'text-success font-bold'
                        }
                      >
                        {row.stats?.breached}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
