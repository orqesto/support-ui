export type AIProvider = 'openai' | 'anthropic' | 'deepseek' | 'perplexity';

export type AIModelType = 'chat' | 'embedding';

export type AIModel = {
  id: string;
  name: string;
  type: AIModelType;
  contextWindow: number;
  description?: string;
};

export type AIProviderConfig = {
  openai?: {
    apiKey: string;
    baseUrl?: string;
    organization?: string;
    defaultChatModel?: string;
    defaultEmbeddingModel?: string;
  };
  anthropic?: {
    apiKey: string;
    baseUrl?: string;
    defaultModel?: string;
  };
  deepseek?: {
    apiKey: string;
    baseUrl?: string;
    defaultModel?: string;
  };
  perplexity?: {
    apiKey: string;
    baseUrl?: string;
    defaultModel?: string;
  };
};
