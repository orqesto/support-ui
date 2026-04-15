import { useQuery } from '@tanstack/react-query';
import { DollarSign, TrendingUp, AlertTriangle, Ghost, Loader2 } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { billingService } from '@/services/billing.service';

export const BillingOverviewCards = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['billing-summary'],
    queryFn: billingService.getBillingSummary,
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={`skeleton-${i}`} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-2" />
              <div className="h-4 w-2/3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        Failed to load billing summary. Please try again later.
      </Alert>
    );
  }

  if (!data) return null;

  return (
    <div className="animate-in fade-in duration-500 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card className="hover:shadow-lg transition-all duration-200 border-l-4 border-l-blue-500">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Active Subscriptions
          </CardTitle>
          <div className="p-2 bg-blue-50 dark:bg-blue-950 rounded-lg">
            <DollarSign className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
            {data.activeSubscriptions}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Registered vendors</p>
        </CardContent>
      </Card>

      <Card className="hover:shadow-lg transition-all duration-200 border-l-4 border-l-green-500">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">Total MRR</CardTitle>
          <div className="p-2 bg-green-50 dark:bg-green-950 rounded-lg">
            <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-green-600 dark:text-green-400">
            ${data.totalMonthlySpend.toLocaleString()}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Monthly spend baseline</p>
        </CardContent>
      </Card>

      <Card className="hover:shadow-lg transition-all duration-200 border-l-4 border-l-red-500">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">Anomalies</CardTitle>
          <div className="p-2 bg-red-50 dark:bg-red-950 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-red-600 dark:text-red-400">
            {data.anomalyCount}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Flagged charges</p>
        </CardContent>
      </Card>

      <Card className="hover:shadow-lg transition-all duration-200 border-l-4 border-l-yellow-500">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">Ghost Charges</CardTitle>
          <div className="p-2 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
            <Ghost className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">
            {data.ghostCharges}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Unregistered vendors</p>
        </CardContent>
      </Card>
    </div>
  );
};
