import {
  Settings,
  ShieldAlert,
  BrainCog,
  Database,
  User,
  Layers,
  Plug,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
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

type SettingsTabContext = {
  isGlobalAdmin: boolean;
};

type SettingsTabDef = {
  id: string;
  label: string;
  icon: LucideIcon;
  description: string;
  render: (ctx: SettingsTabContext) => ReactNode;
  /** When false (or undefined returning false), the tab is excluded from nav + render. */
  visible?: (ctx: SettingsTabContext) => boolean;
};

const SETTINGS_TABS: SettingsTabDef[] = [
  {
    id: 'profile',
    label: 'Profile',
    icon: User,
    description: 'Manage your account and password',
    render: () => (
      <div className="space-y-8">
        <ProfileSettings />
        <NotificationPreferencesSettings />
      </div>
    ),
  },
  {
    id: 'organization',
    label: 'Organization',
    icon: Layers,
    description: 'Manage categories and labels',
    render: () => <OrganizationSettings />,
  },
  {
    id: 'ai',
    label: 'AI',
    icon: BrainCog,
    description: 'Configure AI prompts and lead qualification',
    render: () => <AIConfigSettings />,
  },
  {
    id: 'integrations',
    label: 'Integrations',
    icon: Plug,
    description: 'Connect channels, ticket systems, and AI providers',
    render: (ctx) => <ConnectedServicesSettings isGlobalAdmin={ctx.isGlobalAdmin} />,
  },
  {
    id: 'rules',
    label: 'Rules',
    icon: ShieldAlert,
    description: 'Configure spam, detection, and KB extraction rules',
    render: () => <RulesSettings />,
  },
  {
    id: 'system',
    label: 'System',
    icon: Database,
    description: 'Manage queues, cleanup data, and nuclear options (Admin only)',
    render: () => <SystemManagementSettings />,
    visible: (ctx) => ctx.isGlobalAdmin,
  },
];

const DEFAULT_TAB_ID = 'profile';

export const SettingsPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const isGlobalAdmin = user?.role === 'admin';
  const ctx: SettingsTabContext = { isGlobalAdmin };

  const visibleTabs = SETTINGS_TABS.filter((tab) => (tab.visible ? tab.visible(ctx) : true));
  const validIds = visibleTabs.map((tab) => tab.id);

  const hashTab = location.hash.replace('#', '');
  const activeTabId = validIds.includes(hashTab) ? hashTab : DEFAULT_TAB_ID;

  const handleTabChange = (tabId: string) => {
    navigate('#' + tabId, { replace: true });
  };

  const tabs: Tab<string>[] = visibleTabs.map((tab) => ({
    id: tab.id,
    label: tab.label,
    icon: tab.icon,
    description: tab.description,
  }));

  const activeTab = visibleTabs.find((tab) => tab.id === activeTabId);

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
          activeTab={activeTabId}
          onTabChange={handleTabChange}
          variant="default"
          size="md"
          fullWidth
        >
          {activeTab?.render(ctx)}
        </Tabs>
      </div>
    </Layout>
  );
};
