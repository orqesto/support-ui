import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Pagination } from '@/components/ui/Pagination';
import { billingService } from '@/services/billing.service';

const LIMIT = 10;

export const ActiveSubscriptionsTable = () => {
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useQuery({
    queryKey: ['billing-registry', page],
    queryFn: () => billingService.getPaymentRegistry(page, LIMIT),
    refetchInterval: 120000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Active Subscriptions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center items-center py-8">
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
          <CardTitle>Active Subscriptions</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="danger">Failed to load subscriptions.</Alert>
        </CardContent>
      </Card>
    );
  }

  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / LIMIT);

  if (entries.length === 0) {
    return (
      <Card className="animate-in fade-in duration-500 delay-100">
        <CardHeader>
          <CardTitle>Active Subscriptions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-12 text-center">
            <p className="mb-2 text-lg font-medium text-muted-foreground">
              No subscriptions registered
            </p>
            <p className="text-sm text-muted-foreground">
              Subscriptions are added automatically when billing emails arrive
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="animate-in fade-in duration-500 delay-100">
      <CardHeader>
        <CardTitle>Active Subscriptions ({total})</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left py-2 pr-4 font-medium">Vendor</th>
                <th className="text-right py-2 pr-4 font-medium">Amount</th>
                <th className="text-left py-2 pr-4 font-medium">Cycle</th>
                <th className="text-left py-2 pr-4 font-medium">Last Seen</th>
                <th className="text-left py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b hover:bg-muted/30 transition-colors">
                  <td className="py-2 pr-4 font-medium">{entry.vendorName}</td>
                  <td className="py-2 pr-4 text-right">
                    {entry.baselineAmount !== null
                      ? `${entry.currency} ${entry.baselineAmount.toLocaleString()}`
                      : '—'}
                  </td>
                  <td className="py-2 pr-4 capitalize">{entry.billingCycle}</td>
                  <td className="py-2 pr-4 text-muted-foreground">
                    {entry.lastSeenAt ? format(new Date(entry.lastSeenAt), 'MMM d, yyyy') : '—'}
                  </td>
                  <td className="py-2">
                    <Badge
                      className={
                        entry.isActive
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                      }
                    >
                      {entry.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="mt-4">
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              total={total}
              limit={LIMIT}
              onPageChange={setPage}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
};
