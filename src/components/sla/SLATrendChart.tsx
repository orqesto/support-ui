import { useQuery } from '@tanstack/react-query';
import { Loader2, AlertCircle, RefreshCw, TrendingUp } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { slaService } from '@/services/sla.service';
import { SLA_DEFAULT_DAYS } from './SLAByPriorityTable';

type SLATrendChartProps = {
  days?: number;
};

export const SLATrendChart = ({ days = SLA_DEFAULT_DAYS }: SLATrendChartProps) => {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['sla-trends', { days, interval: 'day' }],
    queryFn: () => slaService.getTrends({ days, interval: 'day' }),
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            SLA Performance Trend ({days} Days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[300px]">
            <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
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

  // Full outer join: include periods that appear in either messages or tickets
  const messagesByPeriod = new Map(data.messages.map((msg) => [msg.period, msg]));
  const ticketsByPeriod = new Map(data.tickets.map((tick) => [tick.period, tick]));
  const allPeriods = [
    ...new Set([...data.messages.map((msg) => msg.period), ...data.tickets.map((tick) => tick.period)]),
  ].sort();
  const chartData = allPeriods.map((period) => {
    const msg = messagesByPeriod.get(period);
    const ticket = ticketsByPeriod.get(period);
    return {
      period,
      messageResponseTime: msg?.avg_response_seconds ? msg.avg_response_seconds / 60 : 0,
      messageBreaches: msg?.breached ?? 0,
      ticketFirstResponse: ticket?.avg_first_response_minutes ?? 0,
      ticketBreaches: ticket?.first_response_breached ?? 0,
    };
  });

  const formatDate = (value: string) => {
    // Slice directly to avoid local-timezone shift on ISO date strings
    const [, month, day] = value.split('-');
    return month && day ? `${Number(month)}/${Number(day)}` : value;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          SLA Performance Trend ({days} Days)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <XAxis dataKey="period" tick={{ fontSize: 12 }} tickFormatter={formatDate} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px',
                color: 'hsl(var(--popover-foreground))',
              }}
            />
            <Legend />

            <Line
              type="monotone"
              dataKey="messageResponseTime"
              stroke="hsl(var(--chart-1, var(--primary)))"
              name="Message Response (min)"
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="messageBreaches"
              stroke="hsl(var(--destructive))"
              name="Message Breaches"
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="ticketFirstResponse"
              stroke="hsl(var(--chart-2, 142 71% 45%))"
              name="Ticket First Response (min)"
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="ticketBreaches"
              stroke="hsl(var(--chart-3, 25 95% 53%))"
              name="Ticket Breaches"
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};
