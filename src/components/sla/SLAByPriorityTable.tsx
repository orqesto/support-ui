import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { slaService } from '@/services/sla.service';

export const SLAByPriorityTable = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['sla-statistics'],
    queryFn: () => slaService.getStatistics({ days: 30 }),
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Ticket SLA by Priority</CardTitle>
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

  const priorities: Array<{
    name: string;
    key: 'critical' | 'high' | 'medium' | 'low';
    variant: 'danger' | 'warning' | 'default' | 'secondary';
  }> = [
    { name: 'Critical', key: 'critical', variant: 'danger' },
    { name: 'High', key: 'high', variant: 'warning' },
    { name: 'Medium', key: 'medium', variant: 'default' },
    { name: 'Low', key: 'low', variant: 'secondary' },
  ];

  const rows = priorities
    .map((priority) => {
      const stats = data.tickets[priority.key];
      if (!stats || stats.total === 0) return null;

      return {
        priority: priority.name,
        variant: priority.variant,
        total: stats.total,
        firstResponseTarget: stats.firstResponseTarget,
        avgFirstResponse: stats.avgFirstResponse.toFixed(1),
        firstResponseBreached: stats.firstResponseBreached,
        resolutionTarget: stats.resolutionTarget,
        avgResolution: stats.avgResolution.toFixed(1),
        resolutionBreached: stats.resolutionBreached,
      };
    })
    .filter(Boolean);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ticket SLA by Priority</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-2">Priority</th>
                <th className="text-center py-2 px-2">Total</th>
                <th className="text-center py-2 px-2">First Response Target</th>
                <th className="text-center py-2 px-2">Avg First Response</th>
                <th className="text-center py-2 px-2">Breached</th>
                <th className="text-center py-2 px-2">Resolution Target</th>
                <th className="text-center py-2 px-2">Avg Resolution</th>
                <th className="text-center py-2 px-2">Breached</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row?.priority} className="border-b last:border-0">
                  <td className="py-2 px-2">
                    <Badge variant={row?.variant}>{row?.priority}</Badge>
                  </td>
                  <td className="text-center py-2 px-2">{row?.total}</td>
                  <td className="text-center py-2 px-2">{row?.firstResponseTarget}m</td>
                  <td className="text-center py-2 px-2">{row?.avgFirstResponse}m</td>
                  <td className="text-center py-2 px-2">
                    <span
                      className={
                        (row?.firstResponseBreached ?? 0) > 0
                          ? 'text-red-600 dark:text-red-400 font-semibold'
                          : 'text-green-600 dark:text-green-400'
                      }
                    >
                      {row?.firstResponseBreached}
                    </span>
                  </td>
                  <td className="text-center py-2 px-2">{row?.resolutionTarget}h</td>
                  <td className="text-center py-2 px-2">{row?.avgResolution}h</td>
                  <td className="text-center py-2 px-2">
                    <span
                      className={
                        (row?.resolutionBreached ?? 0) > 0
                          ? 'text-red-600 dark:text-red-400 font-semibold'
                          : 'text-green-600 dark:text-green-400'
                      }
                    >
                      {row?.resolutionBreached}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};
