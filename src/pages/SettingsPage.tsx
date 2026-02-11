import {
  Settings,
  FolderTree,
  ShieldAlert,
  Inbox,
  Cog,
  BrainCog,
  Zap,
  Database,
  User,
  MessageSquare,
} from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Tabs, type Tab } from '@/components/ui/Tabs';
import { AIProvidersSettings } from '@/components/settings/AIProvidersSettings';
import { CategoriesSettings } from '@/components/settings/CategoriesSettings';
import { ChatWidgetSettings } from '@/components/settings/ChatWidgetSettings';
import { MessageSourcesSettings } from '@/components/settings/MessageSourcesSettings';
import { PromptsSettings } from '@/components/settings/PromptsSettings';
import { RulesSettings } from '@/components/settings/RulesSettings';
import { TicketAutomationSettings } from '@/components/settings/TicketAutomationSettings';
import { SystemManagementSettings } from '@/components/settings/SystemManagementSettings';
import { ProfileSettings } from '@/components/settings/ProfileSettings';
import { useAuthStore } from '@/stores/authStore';

type TabType =
  | 'profile'
  | 'categories'
  | 'prompts'
  | 'rules'
  | 'ai-providers'
  | 'message-sources'
  | 'chat-widgets'
  | 'ticket-automation'
  | 'system-management';

export const SettingsPage = () => {
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const isGlobalAdmin = user?.role === 'admin';

  // Get active tab from URL hash, default to 'profile'
  const activeTab = (location.hash.replace('#', '') || 'profile') as TabType;

  // Handle tab change by updating URL hash
  const handleTabChange = (tabId: TabType) => {
    window.location.hash = tabId;
  };

  const tabs = [
    {
      id: 'profile' as TabType,
      label: 'Profile',
      icon: User,
      description: 'Manage your account and password',
    },
    {
      id: 'categories' as TabType,
      label: 'Categories',
      icon: FolderTree,
      description: 'Manage ticket categories and keywords',
    },
    {
      id: 'prompts' as TabType,
      label: 'AI Prompts',
      icon: Cog,
      description: 'Customize AI prompt templates',
    },
    {
      id: 'rules' as TabType,
      label: 'Rules',
      icon: ShieldAlert,
      description: 'Configure spam, detection, and KB extraction rules',
    },
    {
      id: 'message-sources' as TabType,
      label: 'Message Sources',
      icon: Inbox,
      description: 'Configure Email, Telegram, Slack integrations',
    },
    {
      id: 'ticket-automation' as TabType,
      label: 'Ticket Automation',
      icon: Zap,
      description: 'Configure Auto-Reply, Jira, and workflows',
    },
  ];

  // Add global-admin-only tabs
  const allTabs = [
    ...tabs,
    ...(isGlobalAdmin
      ? [
          {
            id: 'ai-providers' as TabType,
            label: 'AI Providers',
            icon: BrainCog,
            description: 'Configure OpenAI, Anthropic and models',
          },
          {
            id: 'chat-widgets' as TabType,
            label: 'Chat Widgets',
            icon: MessageSquare,
            description: 'Create embeddable AI chat widgets for your website',
          },
          {
            id: 'system-management' as TabType,
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
        {/* Header */}
        <div className="flex justify-between items-center">
          <div className="flex gap-3 items-center">
            <div className="p-2 rounded-lg bg-purple-500/10 dark:bg-purple-500/10">
              <Settings className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">AI Settings</h1>
              <p className="text-muted-foreground">
                Configure AI behavior, categories, and spam detection
              </p>
            </div>
          </div>
        </div>

        <Tabs
          tabs={allTabs as Tab<TabType>[]}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          variant="default"
          size="md"
          fullWidth
        >
          {activeTab === 'profile' && <ProfileSettings />}
          {activeTab === 'categories' && <CategoriesSettings />}
          {activeTab === 'prompts' && <PromptsSettings />}
          {activeTab === 'rules' && <RulesSettings />}
          {activeTab === 'message-sources' && <MessageSourcesSettings />}
          {activeTab === 'ticket-automation' && <TicketAutomationSettings />}
          {isGlobalAdmin && activeTab === 'ai-providers' && <AIProvidersSettings />}
          {isGlobalAdmin && activeTab === 'chat-widgets' && <ChatWidgetSettings />}
          {isGlobalAdmin && activeTab === 'system-management' && <SystemManagementSettings />}
        </Tabs>
      </div>
    </Layout>
  );
};
