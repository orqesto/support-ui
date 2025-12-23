import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { SLABreach } from '@/services/sla.service';
import { slaService } from '@/services/sla.service';

export const SLABreachList = () => {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['sla-breaches'],
    queryFn: () => slaService.getBreaches({ limit: 20 }),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Recent SLA Breaches
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.breaches.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Recent SLA Breaches (0)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            No recent SLA breaches. Great work! 🎉
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
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-orange-500" />
          Recent SLA Breaches ({data.total})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {data.breaches.map((breach) => (
            <div
              key={`${breach.type}-${breach.id}`}
              className="flex items-center justify-between border-b pb-3 last:border-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 p-2 rounded transition-colors"
              onClick={() => handleBreachClick(breach)}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={getVariant(breach.type)}>{breach.type.replace(/_/g, ' ')}</Badge>

                  {breach.channel && <Badge variant="secondary">{breach.channel}</Badge>}

                  {breach.priority && (
                    <Badge variant={getPriorityVariant(breach.priority)}>{breach.priority}</Badge>
                  )}
                </div>

                <p className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                  {breach.subject || breach.title || 'No subject'}
                </p>

                <p className="text-xs text-muted-foreground mt-1">From: {breach.sender}</p>
              </div>

              <div className="text-right ml-4">
                <p className="text-sm font-semibold text-red-600 dark:text-red-400">
                  +{breach.breachAmount}m
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(breach.createdAt), {
                    addSuffix: true,
                  })}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
