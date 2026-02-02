import { Settings, BarChart3 } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Tabs, type Tab } from '@/components/ui/Tabs';
import { AdminPlansTab } from './admin/AdminPlansTab';
import { AdminUsageTab } from './admin/AdminUsageTab';

type TabType = 'plans' | 'usage';

export const AdminDashboardPage = () => {
  const location = useLocation();

  // Get active tab from URL hash, default to 'plans'
  const activeTab = (location.hash.replace('#', '') || 'plans') as TabType;

  // Handle tab change by updating URL hash
  const handleTabChange = (tabId: TabType) => {
    window.location.hash = tabId;
  };

  return (
    <Layout>
      <div className="px-6 py-6 mx-auto space-y-6 w-full max-w-7xl">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">System Administration</h1>
          <p className="mt-1 text-gray-400">
            Manage subscription plans, modules, and monitor organization usage
          </p>
        </div>

        {/* Tabs */}
        <Tabs
          tabs={
            [
              {
                id: 'plans' as const,
                label: 'Plans & Modules',
                icon: Settings,
                description: 'Manage subscription plans and modules',
              },
              {
                id: 'usage' as const,
                label: 'Organization Usage',
                icon: BarChart3,
                description: 'Monitor organization resource usage',
              },
            ] satisfies Tab<TabType>[]
          }
          activeTab={activeTab}
          onTabChange={handleTabChange}
          variant="default"
          size="md"
          fullWidth
        >
          {activeTab === 'plans' && <AdminPlansTab />}
          {activeTab === 'usage' && <AdminUsageTab />}
        </Tabs>
      </div>
    </Layout>
  );
};
