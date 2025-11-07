import { Settings, FolderTree, FileText, Shield, Inbox, Brain, Sparkles, Zap } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { AIProvidersSettings } from '@/components/settings/AIProvidersSettings';
import { CategoriesSettings } from '@/components/settings/CategoriesSettings';
import { DocumentationSettings } from '@/components/settings/DocumentationSettings';
import { EmbeddingSettings } from '@/components/settings/EmbeddingSettings';
import { MessageSourcesSettings } from '@/components/settings/MessageSourcesSettings';
import { PromptsSettings } from '@/components/settings/PromptsSettings';
import { SpamRulesSettings } from '@/components/settings/SpamRulesSettings';
import { TicketAutomationSettings } from '@/components/settings/TicketAutomationSettings';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';

type TabType =
  | 'categories'
  | 'prompts'
  | 'spam-rules'
  | 'documentation'
  | 'embeddings'
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
      icon: FileText,
      description: 'Customize AI prompt templates',
    },
    {
      id: 'spam-rules' as TabType,
      label: 'Spam Rules',
      icon: Shield,
      description: 'Configure spam detection rules',
    },
    {
      id: 'documentation' as TabType,
      label: 'Documentation',
      icon: FileText,
      description: 'Upload knowledge base documents for AI',
    },
    {
      id: 'embeddings' as TabType,
      label: 'Embeddings',
      icon: Sparkles,
      description: 'Choose embedding provider (OpenAI or Local)',
    },
    {
      id: 'ai-providers' as TabType,
      label: 'AI Providers',
      icon: Brain,
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

        {/* Tabs */}
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
                          ? 'border-primary text-primary bg-primary/10'
                          : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-accent'
                      }`}
                    >
                      <Icon className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5 shrink-0" />
                      <span className="text-[10px] sm:text-xs md:text-sm font-medium truncate">
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
              {activeTab === 'spam-rules' && <SpamRulesSettings />}
              {activeTab === 'documentation' && <DocumentationSettings />}
              {activeTab === 'embeddings' && <EmbeddingSettings />}
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
