import { apiClient } from '@/lib/api-client';

// Integration-specific config types
export type EmailConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  secure: boolean;
};

export type GmailConfig = {
  clientId: string;
  clientSecret: string;
  searchQuery: string;
  maxResults: number;
};

export type JiraConfig = {
  apiUrl: string;
  email: string;
  apiToken: string;
  projectKey: string;
};

export type TelegramConfig = {
  botToken: string;
};

export type SlackConfig = {
  botToken: string;
  signingSecret: string;
};

export type OpenAIConfig = {
  apiKey: string;
  baseUrl?: string;
  organization?: string;
  defaultChatModel?: string;
  defaultEmbeddingModel?: string;
};

export type AnthropicConfig = {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
};

export type DeepSeekConfig = {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
};

export type PerplexityConfig = {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
};

// Base integration type
export type BaseIntegration = {
  id: number;
  organizationId: number;
  name: string;
  type: 'email' | 'gmail' | 'jira' | 'telegram' | 'slack' | 'openai' | 'anthropic' | 'deepseek' | 'perplexity';
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  hasCredentials?: boolean;
};

// Type-specific integrations
export type EmailIntegration = BaseIntegration & {
  type: 'email';
  config: EmailConfig;
};

export type GmailIntegration = BaseIntegration & {
  type: 'gmail';
  config: GmailConfig;
};

export type JiraIntegration = BaseIntegration & {
  type: 'jira';
  config: JiraConfig;
};

export type TelegramIntegration = BaseIntegration & {
  type: 'telegram';
  config: TelegramConfig;
};

export type SlackIntegration = BaseIntegration & {
  type: 'slack';
  config: SlackConfig;
};

export type OpenAIIntegration = BaseIntegration & {
  type: 'openai';
  config: OpenAIConfig;
};

export type AnthropicIntegration = BaseIntegration & {
  type: 'anthropic';
  config: AnthropicConfig;
};

export type DeepSeekIntegration = BaseIntegration & {
  type: 'deepseek';
  config: DeepSeekConfig;
};

export type PerplexityIntegration = BaseIntegration & {
  type: 'perplexity';
  config: PerplexityConfig;
};

export type Integration =
  | EmailIntegration
  | GmailIntegration
  | JiraIntegration
  | TelegramIntegration
  | SlackIntegration
  | OpenAIIntegration
  | AnthropicIntegration
  | DeepSeekIntegration
  | PerplexityIntegration;

export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
};

// Generic integrations service (for listing all)
export const integrationsService = {
  getAll: async (): Promise<ApiResponse<Integration[]>> => {
    const response = await apiClient.get<{ success: boolean; data: Integration[] }>(
      '/api/integrations'
    );
    return { success: response.data.success, data: response.data.data };
  },

  // Check if ANY organization has enabled email integrations (system-wide)
  hasAnyEmailIntegrations: async (): Promise<boolean> => {
    try {
      // Make request without organization context to get all integrations
      const response = await apiClient.get<{ success: boolean; data: Integration[] }>(
        '/api/integrations',
        {
          headers: {
            'X-Skip-Org-Context': 'true', // Signal to bypass org filtering
          },
        }
      );

      const emailIntegrations =
        response.data.data?.filter(
          (integration) =>
            integration.enabled && (integration.type === 'email' || integration.type === 'gmail')
        ) ?? [];

      return emailIntegrations.length > 0;
    } catch (error) {
      console.error('Failed to check for email integrations:', error);
      return false;
    }
  },

  getById: async (id: number): Promise<ApiResponse<Integration>> => {
    const response = await apiClient.get<{ success: boolean; data: Integration }>(
      `/api/integrations/${id}`
    );
    return { success: response.data.success, data: response.data.data };
  },

  delete: async (id: number): Promise<ApiResponse<void>> => {
    const response = await apiClient.delete<{ success: boolean; message: string }>(
      `/api/integrations/${id}`
    );
    return { success: response.data.success, message: response.data.message };
  },

  test: async (id: number): Promise<ApiResponse<{ success: boolean; message: string }>> => {
    const response = await apiClient.post<{ success: boolean; message: string }>(
      `/api/integrations/${id}/test`
    );
    return { success: response.data.success, data: response.data };
  },

  upsert: async (data: {
    name: string;
    type: string;
    enabled?: boolean;
    config: Record<string, unknown>;
  }): Promise<ApiResponse<Integration>> => {
    const response = await apiClient.post<{ success: boolean; data: Integration }>(
      '/api/integrations',
      data
    );
    return { success: response.data.success, data: response.data.data };
  },
};

// Jira-specific service
export const jiraService = {
  getAll: async (): Promise<ApiResponse<JiraIntegration[]>> => {
    const response = await apiClient.get<{ success: boolean; data: JiraIntegration[] }>(
      '/api/integrations/jira'
    );
    return { success: response.data.success, data: response.data.data };
  },

  create: async (data: {
    name: string;
    enabled?: boolean;
    config: JiraConfig;
  }): Promise<ApiResponse<JiraIntegration>> => {
    const response = await apiClient.post<{ success: boolean; data: JiraIntegration }>(
      '/api/integrations/jira',
      {
        ...data,
        enabled: data.enabled ?? true,
      }
    );
    return { success: response.data.success, data: response.data.data };
  },
};

// Telegram-specific service
export const telegramService = {
  getAll: async (): Promise<ApiResponse<TelegramIntegration[]>> => {
    const response = await apiClient.get<{ success: boolean; data: TelegramIntegration[] }>(
      '/api/integrations/telegram'
    );
    return { success: response.data.success, data: response.data.data };
  },

  create: async (data: {
    name: string;
    enabled?: boolean;
    config: TelegramConfig;
  }): Promise<ApiResponse<TelegramIntegration>> => {
    const response = await apiClient.post<{ success: boolean; data: TelegramIntegration }>(
      '/api/integrations/telegram',
      {
        ...data,
        enabled: data.enabled ?? true,
      }
    );
    return { success: response.data.success, data: response.data.data };
  },
};

// Slack-specific service
export const slackService = {
  getAll: async (): Promise<ApiResponse<SlackIntegration[]>> => {
    const response = await apiClient.get<{ success: boolean; data: SlackIntegration[] }>(
      '/api/integrations/slack'
    );
    return { success: response.data.success, data: response.data.data };
  },

  create: async (data: {
    name: string;
    enabled?: boolean;
    config: SlackConfig;
  }): Promise<ApiResponse<SlackIntegration>> => {
    const response = await apiClient.post<{ success: boolean; data: SlackIntegration }>(
      '/api/integrations/slack',
      {
        ...data,
        enabled: data.enabled ?? true,
      }
    );
    return { success: response.data.success, data: response.data.data };
  },
};
