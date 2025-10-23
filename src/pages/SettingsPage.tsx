import { useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent } from '@/components/ui/Card';
import { Settings, FolderTree, FileText, Shield, Plug } from 'lucide-react';
import { CategoriesSettings } from '../components/settings/CategoriesSettings';
import { PromptsSettings } from '../components/settings/PromptsSettings';
import { SpamRulesSettings } from '../components/settings/SpamRulesSettings';
import { IntegrationsSettings } from '../components/settings/IntegrationsSettings';

type TabType = 'categories' | 'prompts' | 'spam-rules' | 'integrations';

export const SettingsPage = () => {
  const [activeTab, setActiveTab] = useState<TabType>('categories');

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
      id: 'integrations' as TabType,
      label: 'Integrations',
      icon: Plug,
      description: 'Configure Email, Jira, Telegram, Slack',
    },
  ];

  return (
    <Layout>
      <div className="max-w-7xl mx-auto space-y-6 w-full">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/10 dark:bg-purple-500/10 rounded-lg">
              <Settings className="h-6 w-6 text-purple-600" />
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
          <CardContent className="p-0">
            <div className="border-b">
              <div className="flex">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-2 px-6 py-4 border-b-2 transition-colors ${
                        activeTab === tab.id
                          ? 'border-primary text-primary bg-primary/10'
                          : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-accent'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="font-medium">{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tab Content */}
            <div className="p-6">
              {activeTab === 'categories' && <CategoriesSettings />}
              {activeTab === 'prompts' && <PromptsSettings />}
              {activeTab === 'spam-rules' && <SpamRulesSettings />}
              {activeTab === 'integrations' && <IntegrationsSettings />}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};
