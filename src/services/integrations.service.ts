import { apiClient } from '@/lib/api-client';
import { logger } from '@/lib/logger';

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

export type LocalEmbeddingsConfig = {
  model: string;
  dimensions: number;
  quantized: boolean;
};

export type BedrockConfig = {
  region: string;
  // Static AWS keys (optional) — pasted in the UI, stored encrypted, same as
  // the OpenAI/Anthropic apiKey. When set, used directly (no env / no role).
  accessKeyId?: string;
  secretAccessKey?: string;
  roleArn: string;
  externalId: string;
  defaultModel: string;
  inferenceProfileArn?: string;
};

export type CustomConfig = {
  displayName: string;
  baseUrl: string;
  apiKey?: string;
  defaultChatModel: string;
};

// Base integration type
export type BaseIntegration = {
  id: number;
  organizationId: number;
  name: string;
  type:
    | 'email'
    | 'gmail'
    | 'jira'
    | 'telegram'
    | 'slack'
    | 'openai'
    | 'anthropic'
    | 'deepseek'
    | 'perplexity'
    | 'qwen'
    | 'ollama'
    | 'bedrock'
    | 'custom'
    | 'local_embeddings';
  enabled: boolean;
  departmentId?: number | null;
  isDefault?: boolean;
  isKnowledgeBase?: boolean; // If true, extract Q&A pairs for KB (email/gmail only)
  // Per-source acknowledgment auto-reply template (#19/#20). Only meaningful
  // on email/gmail sources; the runtime skips other channels. Body supports
  // {{customer_name}}, {{tracking_url}}, {{original_subject}} tokens.
  autoReplyEnabled?: boolean | null;
  autoReplySubject?: string | null;
  autoReplyBody?: string | null;
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

export type LocalEmbeddingsIntegration = BaseIntegration & {
  type: 'local_embeddings';
  config: LocalEmbeddingsConfig;
};

export type QwenConfig = {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
};

export type QwenIntegration = BaseIntegration & {
  type: 'qwen';
  config: QwenConfig;
};

export type OllamaConfig = {
  baseUrl?: string;
  defaultModel?: string;
};

export type OllamaIntegration = BaseIntegration & {
  type: 'ollama';
  config: OllamaConfig;
};

export type BedrockIntegration = BaseIntegration & {
  type: 'bedrock';
  config: BedrockConfig;
};

export type CustomIntegration = BaseIntegration & {
  type: 'custom';
  config: CustomConfig;
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
  | PerplexityIntegration
  | LocalEmbeddingsIntegration
  | QwenIntegration
  | OllamaIntegration
  | BedrockIntegration
  | CustomIntegration;

export type SourceDepartmentLink = {
  id: number;
  departmentId: number;
  isDefault: boolean;
  priority: number;
  autoReplyEnabled: boolean;
  name: string;
  slug: string;
  color: string | null;
};

export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  action?: 'created' | 'updated'; // Backend returns this for upsert operations
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
      logger.error('Failed to check for email integrations:', error);
      return false;
    }
  },

  getById: async (id: number, type: string): Promise<ApiResponse<Integration>> => {
    const response = await apiClient.get<{ success: boolean; data: Integration }>(
      `/api/integrations/${id}?type=${encodeURIComponent(type)}`
    );
    return { success: response.data.success, data: response.data.data };
  },

  delete: async (id: number, type: string): Promise<ApiResponse<void>> => {
    const response = await apiClient.delete<{ success: boolean }>(
      `/api/integrations/${id}?type=${encodeURIComponent(type)}`
    );
    return { success: response.data.success };
  },

  test: async (
    id: number,
    type: string
  ): Promise<ApiResponse<{ success: boolean; message: string }>> => {
    const response = await apiClient.post<{ success: boolean; message: string }>(
      `/api/integrations/${id}/test?type=${encodeURIComponent(type)}`
    );
    return { success: response.data.success, data: response.data };
  },

  testImapConfig: async (config: {
    host: string;
    port: number;
    user: string;
    password: string;
    secure: boolean;
    searchCriteria?: string;
    lookbackDays?: number;
  }): Promise<
    ApiResponse<{
      success: boolean;
      message: string;
      details?: { messageCount: number; searchCriteria: string; lookbackDays: number };
    }>
  > => {
    const response = await apiClient.post<{
      success: boolean;
      message: string;
      details?: { messageCount: number; searchCriteria: string; lookbackDays: number };
    }>('/api/integrations/test-imap', config);
    return { success: response.data.success, data: response.data };
  },

  upsert: async (data: {
    name: string;
    type: string;
    enabled?: boolean;
    isKnowledgeBase?: boolean;
    config: Record<string, unknown>;
  }): Promise<ApiResponse<Integration>> => {
    const response = await apiClient.post<{
      success: boolean;
      action?: 'created' | 'updated';
      data: Integration;
    }>('/api/integrations', data);
    return {
      success: response.data.success,
      data: response.data.data,
      action: response.data.action,
    };
  },

  update: async (
    id: number,
    data: Partial<{
      name: string;
      enabled: boolean;
      config: Record<string, unknown>;
      type: string;
    }>
  ): Promise<ApiResponse<Integration>> => {
    const response = await apiClient.patch<{ success: boolean; data: Integration }>(
      `/api/integrations/${id}`,
      data
    );
    return { success: response.data.success, data: response.data.data };
  },

  getSourceDepartments: async (id: number): Promise<ApiResponse<SourceDepartmentLink[]>> => {
    const response = await apiClient.get<{
      success: boolean;
      data: SourceDepartmentLink[];
    }>(`/api/integrations/${id}/departments`);
    return { success: response.data.success, data: response.data.data };
  },

  setSourceDepartments: async (
    id: number,
    departmentIds: number[],
    defaultDepartmentId?: number
  ): Promise<ApiResponse<void>> => {
    const response = await apiClient.put<{ success: boolean }>(
      `/api/integrations/${id}/departments`,
      { departmentIds, defaultDepartmentId }
    );
    return { success: response.data.success };
  },

  updateSourceDepartmentLink: async (
    sourceId: number,
    linkId: number,
    patch: { autoReplyEnabled?: boolean; isDefault?: boolean; priority?: number }
  ): Promise<ApiResponse<void>> => {
    const response = await apiClient.patch<{ success: boolean }>(
      `/api/integrations/${sourceId}/departments/${linkId}`,
      patch
    );
    return { success: response.data.success };
  },

  // Per-source acknowledgment auto-reply template (#19/#20 — gap #3 FE).
  // Email-only on the BE side; non-email sources will reject with 400.
  updateAckReply: async (
    id: number,
    patch: {
      autoReplyEnabled: boolean;
      autoReplySubject?: string | null;
      autoReplyBody?: string | null;
    }
  ): Promise<
    ApiResponse<{
      id: number;
      autoReplyEnabled: boolean;
      autoReplySubject: string | null;
      autoReplyBody: string | null;
    }>
  > => {
    const response = await apiClient.patch<{
      success: boolean;
      data: {
        id: number;
        autoReplyEnabled: boolean;
        autoReplySubject: string | null;
        autoReplyBody: string | null;
      };
    }>(`/api/integrations/${id}/ack-reply`, patch);
    return { success: response.data.success, data: response.data.data };
  },

  /**
   * @deprecated Use ticketingSystemsService.setDefault instead
   * This method is kept for backwards compatibility but uses the new endpoint
   */
  setDefaultTicketing: async (
    id: number,
    type: string = 'jira'
  ): Promise<
    ApiResponse<{
      id: number;
      name: string;
      departmentId: number | null;
      isDefault: boolean;
    }>
  > => {
    const response = await apiClient.post<{
      success: boolean;
      message: string;
      data: {
        id: number;
        name: string;
        departmentId: number | null;
        isDefault: boolean;
      };
    }>(`/api/ticketing-systems/${id}/set-default?type=${type}`);
    return {
      success: response.data.success,
      message: response.data.message,
      data: response.data.data,
    };
  },
};
