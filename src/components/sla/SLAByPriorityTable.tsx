import { useQuery } from '@tanstack/react-query';
import { Loader2, Ticket } from 'lucide-react';
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

  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ticket className="h-5 w-5" />
            Ticket SLA by Priority
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center h-[300px] text-center">
            <Ticket className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground font-medium mb-1">No Ticket Data</p>
            <p className="text-sm text-muted-foreground/70">
              Priority statistics will appear here once tickets are created
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
          <Ticket className="h-5 w-5 text-primary" />
          Ticket SLA by Priority
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left py-3 px-3 font-semibold">Priority</th>
                <th className="text-center py-3 px-3 font-semibold">Total</th>
                <th className="text-center py-3 px-3 font-semibold">First Response Target</th>
                <th className="text-center py-3 px-3 font-semibold">Avg First Response</th>
                <th className="text-center py-3 px-3 font-semibold">Breached</th>
                <th className="text-center py-3 px-3 font-semibold">Resolution Target</th>
                <th className="text-center py-3 px-3 font-semibold">Avg Resolution</th>
                <th className="text-center py-3 px-3 font-semibold">Breached</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row?.priority}
                  className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                >
                  <td className="py-3 px-3">
                    <Badge variant={row?.variant}>{row?.priority}</Badge>
                  </td>
                  <td className="text-center py-3 px-3 font-medium">{row?.total}</td>
                  <td className="text-center py-3 px-3 text-muted-foreground">
                    {row?.firstResponseTarget}m
                  </td>
                  <td className="text-center py-3 px-3 font-medium">{row?.avgFirstResponse}m</td>
                  <td className="text-center py-3 px-3">
                    <span
                      className={
                        (row?.firstResponseBreached ?? 0) > 0
                          ? 'text-red-600 dark:text-red-400 font-bold'
                          : 'text-green-600 dark:text-green-400 font-bold'
                      }
                    >
                      {row?.firstResponseBreached}
                    </span>
                  </td>
                  <td className="text-center py-3 px-3 text-muted-foreground">
                    {row?.resolutionTarget}h
                  </td>
                  <td className="text-center py-3 px-3 font-medium">{row?.avgResolution}h</td>
                  <td className="text-center py-3 px-3">
                    <span
                      className={
                        (row?.resolutionBreached ?? 0) > 0
                          ? 'text-red-600 dark:text-red-400 font-bold'
                          : 'text-green-600 dark:text-green-400 font-bold'
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
