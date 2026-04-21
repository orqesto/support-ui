import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { AlertTriangle, AlertCircle, CheckCircle, Loader2, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { SLABreach } from '@/services/sla.service';
import { slaService } from '@/services/sla.service';

export const SLABreachList = () => {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['sla-breaches'],
    queryFn: () => slaService.getBreaches({ limit: 20 }),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex gap-2 items-center">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            Recent SLA Breaches
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center items-center py-8">
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

  if (!data || data.breaches.length === 0) {
    return (
      <Card className="border-green-200 dark:border-green-900 bg-green-50/50 dark:bg-green-950/20">
        <CardHeader>
          <CardTitle className="flex gap-2 items-center text-green-700 dark:text-green-400">
            <CheckCircle className="w-5 h-5" />
            Recent SLA Breaches (0)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-12 text-center">
            <CheckCircle className="h-12 w-12 text-green-600 dark:text-green-400 mb-4 mx-auto" />
            <p className="mb-2 text-lg font-medium text-green-700 dark:text-green-400">
              No active SLA breaches
            </p>
            <p className="text-sm text-green-600 dark:text-green-500">
              No SLA breaches in the last 24 hours
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const getVariant = (type: string): 'default' | 'secondary' | 'success' | 'warning' | 'danger' => {
    if (type === 'message') return 'default';
    return 'secondary';
  };

  const getPriorityVariant = (
    priority?: string
  ): 'default' | 'secondary' | 'success' | 'warning' | 'danger' => {
    if (priority === 'critical') return 'danger';
    return 'secondary';
  };

  const handleBreachClick = (breach: SLABreach) => {
    if (breach.type === 'message') {
      navigate(`/messages/${breach.id}`);
    } else {
      navigate(`/tickets/${breach.id}`);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex gap-2 items-center">
          <AlertTriangle className="w-5 h-5 text-orange-500" />
          Recent SLA Breaches ({data.total})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {data.breaches.map((breach) => (
            <button
              type="button"
              key={`${breach.type}-${breach.id}`}
              className="flex justify-between items-center w-full text-left p-2 pb-3 rounded border-b transition-colors cursor-pointer last:border-0 hover:bg-muted"
              onClick={() => handleBreachClick(breach)}
            >
              <div className="flex-1">
                <div className="flex flex-wrap gap-2 items-center">
                  <Badge variant={getVariant(breach.type)}>{breach.type.replace(/_/g, ' ')}</Badge>

                  {breach.channel && <Badge variant="secondary">{breach.channel}</Badge>}

                  {breach.priority && (
                    <Badge variant={getPriorityVariant(breach.priority)}>{breach.priority}</Badge>
                  )}
                </div>

                <p className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                  {breach.subject ?? breach.title ?? 'No subject'}
                </p>

                <p className="mt-1 text-xs text-muted-foreground">From: {breach.sender}</p>
              </div>

              <div className="ml-4 text-right">
                <p className="text-sm font-semibold text-red-600 dark:text-red-400">
                  +{breach.breachAmount}m
                </p>
                <p className="text-xs text-muted-foreground">
                  {(() => {
                    try {
                      return formatDistanceToNow(new Date(breach.createdAt), { addSuffix: true });
                    } catch {
                      return '—';
                    }
                  })()}
                </p>
              </div>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
