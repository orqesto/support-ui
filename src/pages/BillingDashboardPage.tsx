import { ActiveSubscriptionsTable } from '@/components/billing/ActiveSubscriptionsTable';
import { AgingReport } from '@/components/billing/AgingReport';
import { AnomalyAlertsList } from '@/components/billing/AnomalyAlertsList';
import { BillingOverviewCards } from '@/components/billing/BillingOverviewCards';

export const BillingDashboardPage = () => (
  <div className="p-6 max-w-7xl mx-auto">
    <div className="mb-6">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Billing Intelligence</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Track active subscriptions, detect anomalous charges, and monitor payment aging
      </p>
    </div>
    <div className="space-y-6">
      <div className="animate-in fade-in duration-500">
        <BillingOverviewCards />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in duration-500 delay-100">
        <AnomalyAlertsList />
        <ActiveSubscriptionsTable />
      </div>
      <div className="animate-in fade-in duration-500 delay-200">
        <AgingReport />
      </div>
    </div>
  </div>
);
