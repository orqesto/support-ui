import {
  Settings,
  ShieldAlert,
  BrainCog,
  Database,
  User,
  Layers,
  Plug,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Tabs, type Tab } from '@/components/ui/Tabs';
import { AIConfigSettings } from '@/components/settings/AIConfigSettings';
import { ConnectedServicesSettings } from '@/components/settings/ConnectedServicesSettings';
import { OrganizationSettings } from '@/components/settings/OrganizationSettings';
import { ProfileSettings } from '@/components/settings/ProfileSettings';
import { NotificationPreferencesSettings } from '@/components/settings/NotificationPreferencesSettings';
import { RulesSettings } from '@/components/settings/RulesSettings';
import { SystemManagementSettings } from '@/components/settings/SystemManagementSettings';
import { useAuthStore } from '@/stores/authStore';

type TabType = 'profile' | 'organization' | 'ai' | 'integrations' | 'rules' | 'system';
const VALID_TABS: TabType[] = ['profile', 'organization', 'ai', 'integrations', 'rules', 'system'];

export const SettingsPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const isGlobalAdmin = user?.role === 'admin';

  const hashTab = location.hash.replace('#', '') as TabType;
  const activeTab: TabType = VALID_TABS.includes(hashTab) ? hashTab : 'profile';

  const handleTabChange = (tabId: TabType) => {
    navigate('#' + tabId, { replace: true });
  };

  const tabs: Tab<TabType>[] = [
    {
      id: 'profile',
      label: 'Profile',
      icon: User,
      description: 'Manage your account and password',
    },
    {
      id: 'organization',
      label: 'Organization',
      icon: Layers,
      description: 'Manage categories and labels',
    },
    {
      id: 'ai',
      label: 'AI',
      icon: BrainCog,
      description: 'Configure AI prompts and lead qualification',
    },
    {
      id: 'integrations',
      label: 'Integrations',
      icon: Plug,
      description: 'Connect channels, ticket systems, and AI providers',
    },
    {
      id: 'rules',
      label: 'Rules',
      icon: ShieldAlert,
      description: 'Configure spam, detection, and KB extraction rules',
    },
    ...(isGlobalAdmin
      ? [
          {
            id: 'system' as TabType,
            label: 'System',
            icon: Database,
            description: 'Manage queues, cleanup data, and nuclear options (Admin only)',
          },
        ]
      : []),
  ];

  return (
    <Layout>
      <div className="px-2 mx-auto space-y-4 w-full max-w-7xl">
        <div className="flex justify-between items-center">
          <div className="flex gap-3 items-center">
            <div className="p-2 rounded-lg bg-purple-500/10 dark:bg-purple-500/10">
              <Settings className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Settings</h1>
              <p className="text-muted-foreground">
                Configure AI behavior, categories, and integrations
              </p>
            </div>
          </div>
        </div>

        <Tabs
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          variant="default"
          size="md"
          fullWidth
        >
          {activeTab === 'profile' && (
            <div className="space-y-8">
              <ProfileSettings />
              <NotificationPreferencesSettings />
            </div>
          )}
          {activeTab === 'organization' && <OrganizationSettings />}
          {activeTab === 'ai' && <AIConfigSettings />}
          {activeTab === 'integrations' && <ConnectedServicesSettings isGlobalAdmin={isGlobalAdmin} />}
          {activeTab === 'rules' && <RulesSettings />}
          {isGlobalAdmin && activeTab === 'system' && <SystemManagementSettings />}
        </Tabs>
      </div>
    </Layout>
  );
};
