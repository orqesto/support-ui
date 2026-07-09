import { Settings, BarChart3 } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import { Layout } from '@/components/layout/Layout';
import { Tabs, type Tab } from '@/components/ui/Tabs';
import { Permission } from '@/types/roles';
import { AdminPlansTab } from './admin/AdminPlansTab';
import { AdminUsageTab } from './admin/AdminUsageTab';

type TabType = 'plans' | 'usage';

const VALID_TABS: TabType[] = ['plans', 'usage'];

export const AdminDashboardPage = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // Validate hash against known tabs to avoid silently casting arbitrary values
  const rawTab = location.hash.replace('#', '');
  const activeTab: TabType = (VALID_TABS as string[]).includes(rawTab) ? (rawTab as TabType) : 'plans';

  // Use navigate so the back button restores the previous tab correctly
  const handleTabChange = (tabId: TabType) => {
    navigate({ hash: tabId }, { replace: true });
  };

  return (
    <Layout>
      <PermissionGuard
        permission={Permission.MANAGE_ORGANIZATION}
        fallback={
          <div className="flex items-center justify-center h-64 text-gray-500">
            You do not have permission to access System Administration.
          </div>
        }
      >
      <div className="px-6 py-6 mx-auto space-y-6 w-full">
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
      </PermissionGuard>
    </Layout>
  );
};
