import { Settings, FolderTree, ShieldAlert, Inbox, Cog, BrainCog, Zap } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { AIProvidersSettings } from '@/components/settings/AIProvidersSettings';
import { CategoriesSettings } from '@/components/settings/CategoriesSettings';
import { MessageSourcesSettings } from '@/components/settings/MessageSourcesSettings';
import { PromptsSettings } from '@/components/settings/PromptsSettings';
import { RulesSettings } from '@/components/settings/RulesSettings';
import { TicketAutomationSettings } from '@/components/settings/TicketAutomationSettings';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';

type TabType =
  | 'categories'
  | 'prompts'
  | 'rules'
  | 'ai-providers'
  | 'message-sources'
  | 'ticket-automation';

export const SettingsPage = () => {
  const location = useLocation();

  // Get active tab from URL hash, default to 'categories'
  const activeTab = (location.hash.replace('#', '') || 'categories') as TabType;

  // Handle tab change by updating URL hash
  const handleTabChange = (tabId: TabType) => {
    window.location.hash = tabId;
  };

  const tabs = [
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
      id: 'ai-providers' as TabType,
      label: 'AI Providers',
      icon: BrainCog,
      description: 'Configure OpenAI, Anthropic and models',
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

  return (
    <Layout>
      <div className="px-4 mx-auto space-y-4 w-full max-w-7xl">
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


        <Card>
          <CardContent className="overflow-visible p-0">
            <div className="overflow-visible border-b">
              <div className="flex">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <Button
                      key={tab.id}
                      variant="ghost"
                      onClick={() => handleTabChange(tab.id)}
                      title={tab.label}
                      className={`flex-1 h-auto rounded-none items-center justify-center gap-1 sm:gap-2 px-1 py-2 sm:px-2 sm:py-3 md:px-4 md:py-4 border-b-2 transition-colors min-w-0 ${
                        activeTab === tab.id
                          ? 'border-primary text-primary bg-primary/10 '
                          : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-accent'
                      }`}
                    >
                      <Icon className="w-5 h-5 sm:w-4 sm:h-4 md:w-5 md:h-5 shrink-0" />
                      <span className="text-[10px] hidden sm:block sm:text-xs md:text-sm font-medium truncate">
                        {tab.label}
                      </span>
                    </Button>
                  );
                })}
              </div>
            </div>

            {/* Tab Content */}
            <div className="p-6" key={activeTab}>
              {activeTab === 'categories' && <CategoriesSettings />}
              {activeTab === 'prompts' && <PromptsSettings />}
              {activeTab === 'rules' && <RulesSettings />}
              {activeTab === 'ai-providers' && <AIProvidersSettings />}
              {activeTab === 'message-sources' && <MessageSourcesSettings />}
              {activeTab === 'ticket-automation' && <TicketAutomationSettings />}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};
