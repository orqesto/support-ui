export type AIProvider = 'openai' | 'anthropic' | 'deepseek' | 'perplexity' | 'qwen' | 'ollama';

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
  qwen?: {
    apiKey: string;
    baseUrl?: string;
    defaultModel?: string;
  };
  ollama?: {
    baseUrl?: string;
    defaultModel?: string;
  };
};
