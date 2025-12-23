import { useQuery } from '@tanstack/react-query';
import { Clock, AlertCircle, CheckCircle2, TrendingUp, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { slaService } from '@/services/sla.service';

export const SLAOverviewCards = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['sla-summary'],
    queryFn: slaService.getSummary,
    refetchInterval: 60000, // Refresh every minute
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={`skeleton-${i}`}>
            <CardHeader>
              <Loader2 className="h-4 w-4 animate-spin" />
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="grid grid-cols-4 gap-4">
      {/* Message Response Time */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{data.messages.avgResponseTime}m</div>
          <p className="text-xs text-muted-foreground">Last 24 hours</p>
        </CardContent>
      </Card>

      {/* Message Compliance Rate */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Message SLA Rate</CardTitle>
          <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{data.messages.complianceRate.toFixed(1)}%</div>
          <p className="text-xs text-muted-foreground">All time compliance</p>
        </CardContent>
      </Card>

      {/* Breaches Today */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Breaches (24h)</CardTitle>
          <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-red-600 dark:text-red-400">
            {data.messages.breaches24h + data.tickets.firstResponseBreaches24h}
          </div>
          <p className="text-xs text-muted-foreground">
            {data.messages.breaches24h} messages, {data.tickets.firstResponseBreaches24h} tickets
          </p>
        </CardContent>
      </Card>

      {/* Ticket Compliance */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Ticket SLA Rate</CardTitle>
          <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{data.tickets.complianceRate.toFixed(1)}%</div>
          <p className="text-xs text-muted-foreground">All time compliance</p>
        </CardContent>
      </Card>
    </div>
  );
};
