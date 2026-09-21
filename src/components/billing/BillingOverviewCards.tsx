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
        {Array.from({ length: 4 }, (_, idx) => (
          <Card key={`skeleton-${idx}`} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-muted rounded animate-pulse mb-2" />
              <div className="h-4 w-2/3 bg-muted rounded animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="danger">
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
          <div className="p-2 bg-primary-muted rounded-lg">
            <DollarSign className="h-5 w-5 text-primary" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-primary">
            {data.activeSubscriptions}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Registered vendors</p>
        </CardContent>
      </Card>

      <Card className="hover:shadow-lg transition-all duration-200 border-l-4 border-l-green-500">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">Total MRR</CardTitle>
          <div className="p-2 bg-success-muted rounded-lg">
            <TrendingUp className="h-5 w-5 text-success" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-success">
            ${data.totalMonthlySpend.toLocaleString()}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Monthly spend baseline</p>
        </CardContent>
      </Card>

      <Card className="hover:shadow-lg transition-all duration-200 border-l-4 border-l-red-500">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">Anomalies</CardTitle>
          <div className="p-2 bg-destructive-muted rounded-lg">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-destructive">
            {data.anomalyCount}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Flagged charges</p>
        </CardContent>
      </Card>

      <Card className="hover:shadow-lg transition-all duration-200 border-l-4 border-l-yellow-500">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">Ghost Charges</CardTitle>
          <div className="p-2 bg-warning-muted rounded-lg">
            <Ghost className="h-5 w-5 text-warning" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-warning">
            {data.ghostCharges}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Unregistered vendors</p>
        </CardContent>
      </Card>
    </div>
  );
};
