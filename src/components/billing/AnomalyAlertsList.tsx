import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Tooltip } from '@/components/ui/Tooltip';
import { Alert } from '@/components/ui/Alert';
import type { BillingRecord } from '@/services/billing.service';
import { billingService } from '@/services/billing.service';

const getAnomalyBadges = (record: BillingRecord) => {
  const badges: { label: string; className: string }[] = [];
  if (record.isGhostCharge) {
    badges.push({
      label: 'Ghost Charge',
      className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    });
  }
  if (record.isZombie) {
    badges.push({
      label: 'Zombie Subscription',
      className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    });
  }
  if (record.isAmountDrift) {
    badges.push({
      label: 'Amount Drift',
      className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    });
  }
  if (record.isDuplicate) {
    badges.push({
      label: 'Duplicate',
      className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    });
  }
  return badges;
};

export const AnomalyAlertsList = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['billing-records-anomalies'],
    queryFn: () => billingService.getBillingRecords(1, 10, true),
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex gap-2 items-center">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            Anomaly Alerts
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

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex gap-2 items-center">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            Anomaly Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="danger">Failed to load anomaly alerts.</Alert>
        </CardContent>
      </Card>
    );
  }

  const records = data?.records ?? [];

  if (records.length === 0) {
    return (
      <Card className="border-green-200 dark:border-green-900 bg-green-50/50 dark:bg-green-950/20">
        <CardHeader>
          <CardTitle className="flex gap-2 items-center text-green-700 dark:text-green-400">
            <AlertTriangle className="w-5 h-5" />
            Anomaly Alerts (0)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-12 text-center">
            <p className="mb-2 text-lg font-medium text-green-700 dark:text-green-400">
              No anomalies detected
            </p>
            <p className="text-sm text-green-600 dark:text-green-500">
              All charges are within normal parameters. Check back after the next daily scan
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="animate-in fade-in duration-500 delay-100">
      <CardHeader>
        <CardTitle className="flex gap-2 items-center">
          <AlertTriangle className="w-5 h-5 text-orange-500" />
          Anomaly Alerts ({data?.total ?? 0})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {records.map((record) => (
            <div
              key={record.id}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                }
              }}
              className="flex items-start justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm truncate">{record.vendorName}</span>
                  <span className="text-sm text-muted-foreground">
                    {record.currency} {record.amount.toLocaleString()}
                  </span>
                </div>
                <div className="flex gap-1 flex-wrap mt-1">
                  {getAnomalyBadges(record).map((badge) => (
                    <Tooltip key={badge.label} content={record.anomalyDetails ?? badge.label}>
                      <Badge className={badge.className}>{badge.label}</Badge>
                    </Tooltip>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
