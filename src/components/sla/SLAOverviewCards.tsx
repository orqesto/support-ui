import { useQuery } from '@tanstack/react-query';
import { Clock, AlertCircle, CheckCircle2, TrendingUp, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { slaService } from '@/services/sla.service';

export const SLAOverviewCards = () => {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['sla-summary'],
    queryFn: slaService.getSummary,
    refetchInterval: 60000, // Refresh every minute
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={`skeleton-${i}`} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </CardHeader>
            <CardContent>
              <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-2" />
              <div className="h-4 w-2/3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>
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

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Message Response Time */}
      <Card className="hover:shadow-lg transition-all duration-200 border-l-4 border-l-blue-500">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Avg Response Time
          </CardTitle>
          <div className="p-2 bg-blue-50 dark:bg-blue-950 rounded-lg">
            <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
            {data.messages.avgResponseTime !== null && data.messages.avgResponseTime !== undefined ? `${data.messages.avgResponseTime}m` : '\u2014'}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Last 24 hours</p>
        </CardContent>
      </Card>

      {/* Message Compliance Rate */}
      <Card className="hover:shadow-lg transition-all duration-200 border-l-4 border-l-green-500">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Message SLA Rate
          </CardTitle>
          <div className="p-2 bg-green-50 dark:bg-green-950 rounded-lg">
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-green-600 dark:text-green-400">
            {data.messages.complianceRate !== null && data.messages.complianceRate !== undefined
              ? `${data.messages.complianceRate.toFixed(1)}%`
              : '—'}
          </div>
          <p className="text-xs text-muted-foreground mt-1">All time compliance</p>
        </CardContent>
      </Card>

      {/* Breaches Today */}
      <Card className="hover:shadow-lg transition-all duration-200 border-l-4 border-l-red-500">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Breaches (24h)
          </CardTitle>
          <div className="p-2 bg-red-50 dark:bg-red-950 rounded-lg">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-red-600 dark:text-red-400">
            {data.messages.breaches24h + data.tickets.firstResponseBreaches24h + data.tickets.resolutionBreaches24h}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {data.messages.breaches24h} msgs · {data.tickets.firstResponseBreaches24h + data.tickets.resolutionBreaches24h} tkts
          </p>
        </CardContent>
      </Card>

      {/* Ticket Compliance */}
      <Card className="hover:shadow-lg transition-all duration-200 border-l-4 border-l-purple-500">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Ticket SLA Rate
          </CardTitle>
          <div className="p-2 bg-purple-50 dark:bg-purple-950 rounded-lg">
            <TrendingUp className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">
            {data.tickets.complianceRate !== null && data.tickets.complianceRate !== undefined
              ? `${data.tickets.complianceRate.toFixed(1)}%`
              : '—'}
          </div>
          <p className="text-xs text-muted-foreground mt-1">All time compliance</p>
        </CardContent>
      </Card>
    </div>
  );
};
