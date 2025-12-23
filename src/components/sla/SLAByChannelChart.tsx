import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { slaService } from '@/services/sla.service';

export const SLAByChannelChart = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['sla-statistics'],
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
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
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
      avgResponse: data.messages.email?.avgResponseSeconds
        ? (data.messages.email.avgResponseSeconds / 60).toFixed(1)
        : 0,
    },
    {
      channel: 'Telegram',
      total: data.messages.telegram?.total ?? 0,
      responded: data.messages.telegram?.responded ?? 0,
      breached: data.messages.telegram?.breached ?? 0,
      avgResponse: data.messages.telegram?.avgResponseSeconds
        ? (data.messages.telegram.avgResponseSeconds / 60).toFixed(1)
        : 0,
    },
    {
      channel: 'Slack',
      total: data.messages.slack?.total ?? 0,
      responded: data.messages.slack?.responded ?? 0,
      breached: data.messages.slack?.breached ?? 0,
      avgResponse: data.messages.slack?.avgResponseSeconds
        ? (data.messages.slack.avgResponseSeconds / 60).toFixed(1)
        : 0,
    },
  ].filter((item) => item.total > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Message SLA by Channel</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="channel" />
            <YAxis />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                border: '1px solid #ccc',
                borderRadius: '4px',
              }}
            />
            <Legend />
            <Bar dataKey="total" fill="#8884d8" name="Total" />
            <Bar dataKey="responded" fill="#82ca9d" name="Responded" />
            <Bar dataKey="breached" fill="#ff6b6b" name="Breached" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};
