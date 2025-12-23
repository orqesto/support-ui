import { Layout } from '@/components/layout/Layout';
import { SLABreachList } from '@/components/sla/SLABreachList';
import { SLAByChannelChart } from '@/components/sla/SLAByChannelChart';
import { SLAByPriorityTable } from '@/components/sla/SLAByPriorityTable';
import { SLAOverviewCards } from '@/components/sla/SLAOverviewCards';
import { SLATrendChart } from '@/components/sla/SLATrendChart';

export const SLADashboardPage = () => (
  <Layout>
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">SLA Performance Dashboard</h1>
      </div>

      {/* Quick metrics cards */}
      <SLAOverviewCards />

      <div className="grid grid-cols-2 gap-6">
        {/* Message SLA by channel */}
        <SLAByChannelChart />

        {/* Ticket SLA by priority */}
        <SLAByPriorityTable />
      </div>

      {/* Trend chart */}
      <SLATrendChart />

      {/* Recent breaches */}
      <SLABreachList />
    </div>
  </Layout>
);
