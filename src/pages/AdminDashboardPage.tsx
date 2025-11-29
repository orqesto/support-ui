import { useState } from 'react';
import { Settings, BarChart3 } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { AdminPlansTab } from './admin/AdminPlansTab';
import { AdminUsageTab } from './admin/AdminUsageTab';

type TabType = 'plans' | 'usage';

export const AdminDashboardPage = () => {
  const [activeTab, setActiveTab] = useState<TabType>('plans');

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
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px space-x-8">
            <button
              onClick={() => setActiveTab('plans')}
              className={`
                flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm
                ${
                  activeTab === 'plans'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              <Settings className="w-5 h-5" />
              Plans & Modules
            </button>
            <button
              onClick={() => setActiveTab('usage')}
              className={`
                flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm
                ${
                  activeTab === 'usage'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              <BarChart3 className="w-5 h-5" />
              Organization Usage
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        <div className="mt-6">
          {activeTab === 'plans' && <AdminPlansTab />}
          {activeTab === 'usage' && <AdminUsageTab />}
        </div>
      </div>
    </Layout>
  );
};
