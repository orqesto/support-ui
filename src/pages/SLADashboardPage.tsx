import { SLAOverviewCards } from '@/components/sla/SLAOverviewCards';
import { SLAByChannelChart } from '@/components/sla/SLAByChannelChart';
import { SLAByPriorityTable } from '@/components/sla/SLAByPriorityTable';
import { SLATrendChart } from '@/components/sla/SLATrendChart';
import { SLABreachList } from '@/components/sla/SLABreachList';

export const SLADashboardPage = () => (
  <div className="p-6 max-w-7xl mx-auto">
    <div className="mb-6">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">SLA Performance</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Monitor service level agreement metrics and performance across messages and tickets
      </p>
    </div>

    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="animate-in fade-in duration-500">
        <SLAOverviewCards />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in duration-500 delay-100">
        <SLAByChannelChart />
        <SLAByPriorityTable />
      </div>

      {/* Trend Chart */}
      <div className="animate-in fade-in duration-500 delay-200">
        <SLATrendChart />
      </div>

      {/* Breaches List */}
      <div className="animate-in fade-in duration-500 delay-300">
        <SLABreachList />
      </div>
    </div>
  </div>
);
