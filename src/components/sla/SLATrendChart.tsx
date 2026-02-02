import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { slaService } from '@/services/sla.service';

export const SLATrendChart = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['sla-trends', { days: 30, interval: 'day' }],
    queryFn: () => slaService.getTrends({ days: 30, interval: 'day' }),
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>SLA Performance Trend (30 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[300px]">
            <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  // Merge message and ticket data by period
  const chartData = data.messages.map((msg, i) => {
    const ticket = data.tickets[i];
    return {
      period: msg.period,
      messageResponseTime: msg.avg_response_seconds ? msg.avg_response_seconds / 60 : 0,
      messageBreaches: msg.breached,
      ticketFirstResponse: ticket?.avg_first_response_minutes ?? 0,
      ticketBreaches: ticket?.first_response_breached ?? 0,
    };
  });

  const formatDate = (value: string) => {
    const date = new Date(value);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>SLA Performance Trend (30 Days)</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <XAxis dataKey="period" tick={{ fontSize: 12 }} tickFormatter={formatDate} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                border: '1px solid #ccc',
                borderRadius: '4px',
              }}
            />
            <Legend />

            <Line
              type="monotone"
              dataKey="messageResponseTime"
              stroke="#8884d8"
              name="Message Response (min)"
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="messageBreaches"
              stroke="#ff6b6b"
              name="Message Breaches"
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="ticketFirstResponse"
              stroke="#51cf66"
              name="Ticket First Response (min)"
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="ticketBreaches"
              stroke="#ff8787"
              name="Ticket Breaches"
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};
