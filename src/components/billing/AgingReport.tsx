import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Alert } from '@/components/ui/Alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { billingService } from '@/services/billing.service';

const BAR_COLORS = ['#3B82F6', '#F59E0B', '#EF4444'];

export const AgingReport = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['billing-aging'],
    queryFn: billingService.getAgingReport,
    refetchInterval: 300000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Billing Aging Report</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center items-center h-[300px]">
            <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Billing Aging Report</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="danger">Failed to load aging report.</Alert>
        </CardContent>
      </Card>
    );
  }

  const buckets = data?.buckets ?? [
    { label: 'Current (0-30 days)', count: 0, total: 0 },
    { label: 'Aging (31-60 days)', count: 0, total: 0 },
    { label: 'Overdue (60+ days)', count: 0, total: 0 },
  ];

  const chartData = buckets.map((b, i) => ({
    label: b.label,
    total: b.total,
    count: b.count,
    fill: BAR_COLORS[i],
  }));

  return (
    <Card className="duration-500 delay-200 animate-in fade-in">
      <CardHeader>
        <CardTitle>Billing Aging Report</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer
          width="100%"
          height={300}
          aria-label="Billing aging report showing charge distribution by age"
        >
          <BarChart data={chartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip
              formatter={(value: number | undefined) => [
                `$${value?.toLocaleString()}`,
                'Total Amount',
              ]}
            />
            <Bar dataKey="total" fill="#3B82F6" radius={[4, 4, 0, 0]}>
              {chartData.map((entry, index) => (
                <rect key={`bar-${index}`} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="flex gap-6 justify-center mt-4 text-sm">
          {buckets.map((b, i) => (
            <div key={b.label} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: BAR_COLORS[i] }} />
              <span className="text-muted-foreground">{b.label}</span>
              <span className="font-medium">({b.count})</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
