import { useQuery } from '@tanstack/react-query';
import { Loader2, Inbox, AlertCircle, RefreshCw } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { slaService } from '@/services/sla.service';

export const SLAByChannelChart = () => {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['sla-statistics', { days: 30 }],
    queryFn: () => slaService.getStatistics({ days: 30 }),
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Message SLA by Channel</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[300px]">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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

  const chartData = [
    {
      channel: 'Email',
      total: data.messages.email?.total ?? 0,
      responded: data.messages.email?.responded ?? 0,
      breached: data.messages.email?.breached ?? 0,
    },
    {
      channel: 'Telegram',
      total: data.messages.telegram?.total ?? 0,
      responded: data.messages.telegram?.responded ?? 0,
      breached: data.messages.telegram?.breached ?? 0,
    },
    {
      channel: 'Slack',
      total: data.messages.slack?.total ?? 0,
      responded: data.messages.slack?.responded ?? 0,
      breached: data.messages.slack?.breached ?? 0,
    },
  ].filter((item) => item.total > 0);

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Inbox className="h-5 w-5" />
            Message SLA by Channel
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center h-[300px] text-center">
            <Inbox className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground font-medium mb-1">No Message Data</p>
            <p className="text-sm text-muted-foreground/70">
              Channel statistics will appear here once messages are processed
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
          <Inbox className="h-5 w-5 text-primary" />
          Message SLA by Channel
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="channel" />
            <YAxis />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px',
                color: 'hsl(var(--popover-foreground))',
              }}
            />
            <Legend />
            <Bar dataKey="total" fill="hsl(var(--chart-1, var(--primary)))" name="Total" />
            <Bar dataKey="responded" fill="hsl(var(--chart-2, 142 71% 45%))" name="Responded" />
            <Bar dataKey="breached" fill="hsl(var(--destructive))" name="Breached" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};
