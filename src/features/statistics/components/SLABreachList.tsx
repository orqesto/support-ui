import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { AlertTriangle, AlertCircle, CheckCircle, Loader2, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { DataTable, type ColumnDef } from '@/components/ui/DataTable';
import type { SLABreach } from '@/features/statistics/services/sla.service';
import { slaService } from '@/features/statistics/services/sla.service';
import { SLA_DEFAULT_DAYS, SLA_PRIORITIES } from './SLAByPriorityTable';
import { isCustomPeriod, periodKey, periodParams, type ReportPeriod } from '@/lib/reportPeriod';

type SLABreachListProps = {
  days?: number;
  /** A custom window (the date picker); wins over `days`. */
  period?: ReportPeriod;
};

const windowLabel = (days: number) => (days === 1 ? 'last 24 hours' : `last ${days} days`);

const getVariant = (type: string): 'default' | 'secondary' => {
  if (type === 'message' || type === 'message_resolution') return 'default';
  return 'secondary';
};

const getPriorityVariant = (priority?: string): 'danger' | 'secondary' => {
  if (priority === 'critical') return 'danger';
  return 'secondary';
};

/** Critical first, as the app orders priorities (not alphabetically); unknown last. */
const priorityRank = (priority?: string) => {
  const rank = SLA_PRIORITIES.findIndex((entry) => entry.key === priority);
  return rank === -1 ? undefined : rank;
};

const timeOf = (createdAt: string) => {
  const time = new Date(createdAt).getTime();
  return Number.isNaN(time) ? undefined : time;
};

const relativeTime = (createdAt: string) => {
  try {
    return formatDistanceToNow(new Date(createdAt), { addSuffix: true });
  } catch {
    return '—';
  }
};

// A thread can breach more than once (waits, resolution cycles): the start disambiguates.
const breachKey = (breach: SLABreach) =>
  `${breach.type}-${breach.waitId ?? breach.id}-${breach.createdAt}`;

export const SLABreachList = ({ days = SLA_DEFAULT_DAYS, period }: SLABreachListProps) => {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['sla-breaches', { window: period ? periodKey(period) : days }],
    queryFn: () =>
      slaService.getBreaches({ limit: 20, ...(period ? periodParams(period) : { days }) }),
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex gap-2 items-center">
            <AlertTriangle className="w-5 h-5 text-warning" />
            Recent SLA Breaches
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center items-center py-8">
            <Loader2 className="w-8 h-8 text-faint-foreground animate-spin" />
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
          <p className="text-xs text-muted-foreground mb-4">
            Something went wrong while fetching data
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.breaches.length === 0) {
    return (
      <Card className="border-success-line bg-success-muted/50">
        <CardHeader>
          <CardTitle className="flex gap-2 items-center text-success">
            <CheckCircle className="w-5 h-5" />
            Recent SLA Breaches (0)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-12 text-center">
            <CheckCircle className="h-12 w-12 text-success mb-4 mx-auto" />
            <p className="mb-2 text-lg font-medium text-success">No active SLA breaches</p>
            <p className="text-sm text-success">
              No SLA breaches in the{' '}
              {period && isCustomPeriod(period) ? 'selected period' : windowLabel(days)}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const handleBreachClick = (breach: SLABreach) => {
    if (breach.type === 'message' || breach.type === 'message_resolution') {
      navigate(`/threads/${breach.id}`);
    } else {
      navigate(`/tickets/${breach.id}`);
    }
  };

  // Most overdue first; a header click sorts by that column, a third click comes back here.
  const rows = [...data.breaches].sort((left, right) => right.breachAmount - left.breachAmount);

  const columns: ColumnDef<SLABreach>[] = [
    {
      id: 'type',
      header: 'Type',
      sortValue: (breach) => breach.type,
      cell: (breach) => (
        <Badge variant={getVariant(breach.type)}>{breach.type.replace(/_/g, ' ')}</Badge>
      ),
    },
    {
      id: 'channel',
      header: 'Channel',
      sortValue: (breach) => breach.channel,
      cell: (breach) => breach.channel && <Badge variant="secondary">{breach.channel}</Badge>,
    },
    {
      id: 'priority',
      header: 'Priority',
      sortValue: (breach) => priorityRank(breach.priority),
      cell: (breach) =>
        breach.priority && (
          <Badge variant={getPriorityVariant(breach.priority)}>{breach.priority}</Badge>
        ),
    },
    {
      id: 'subject',
      header: 'Subject',
      sortValue: (breach) => breach.subject ?? breach.title ?? 'No subject',
      cell: (breach) => (
        <Button
          type="button"
          variant="ghost"
          className="flex flex-col items-start w-full h-auto text-left p-2 rounded transition-colors cursor-pointer hover:bg-muted"
          onClick={() => handleBreachClick(breach)}
        >
          <span className="text-sm font-medium text-foreground">
            {breach.subject ?? breach.title ?? 'No subject'}
          </span>
          <span className="mt-1 text-xs font-normal text-muted-foreground">
            From: {breach.sender}
          </span>
        </Button>
      ),
    },
    {
      id: 'overdue',
      header: 'Overdue',
      sortValue: (breach) => breach.breachAmount,
      align: 'right',
      cell: (breach) => (
        <span className="text-sm font-semibold text-destructive">+{breach.breachAmount}m</span>
      ),
    },
    {
      id: 'when',
      header: 'When',
      sortValue: (breach) => timeOf(breach.createdAt),
      align: 'right',
      cellClassName: 'text-xs text-muted-foreground',
      cell: (breach) => relativeTime(breach.createdAt),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex gap-2 items-center">
          <AlertTriangle className="w-5 h-5 text-warning" />
          Recent SLA Breaches ({data.total})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable
          rows={rows}
          rowKey={breachKey}
          columns={columns}
          pagination={{ mode: 'client', pageSize: Math.max(rows.length, 1) }}
        />
      </CardContent>
    </Card>
  );
};
