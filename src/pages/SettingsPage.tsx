import { Settings, FolderTree, FileText, Shield, Plug, Brain, Sparkles } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { AIProvidersSettings } from '../components/settings/AIProvidersSettings';
import { CategoriesSettings } from '../components/settings/CategoriesSettings';
import { EmbeddingSettings } from '../components/settings/EmbeddingSettings';
import { IntegrationsSettings } from '../components/settings/IntegrationsSettings';
import { PromptsSettings } from '../components/settings/PromptsSettings';
import { SpamRulesSettings } from '../components/settings/SpamRulesSettings';

type TabType = 'categories' | 'prompts' | 'spam-rules' | 'integrations' | 'ai-providers' | 'embeddings';

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
      id: 'integrations' as TabType,
      label: 'Integrations',
      icon: Plug,
      description: 'Configure Email, Jira, Telegram, Slack',
    },
  ];

  return (
    <Layout>
      <div className="mx-auto space-y-6 w-full max-w-7xl">
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
          <CardContent className="p-0">
            <div className="border-b">
              <div className="flex">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <Button
                      key={tab.id}
                      variant="ghost"
                      onClick={() => handleTabChange(tab.id)}
                      className={`h-auto rounded-none items-center gap-2 px-6 py-4 border-b-2 transition-colors ${
                        activeTab === tab.id
                          ? 'border-primary text-primary bg-primary/10'
                          : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-accent'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="font-medium">{tab.label}</span>
                    </Button>
                  );
                })}
              </div>
            </div>

            {/* Tab Content */}
            <div className="p-6">
              {activeTab === 'categories' && <CategoriesSettings />}
              {activeTab === 'prompts' && <PromptsSettings />}
              {activeTab === 'spam-rules' && <SpamRulesSettings />}
              {activeTab === 'embeddings' && <EmbeddingSettings />}
              {activeTab === 'ai-providers' && <AIProvidersSettings />}
              {activeTab === 'integrations' && <IntegrationsSettings />}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};
