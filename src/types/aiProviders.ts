export type AIProvider =
  | 'openai'
  | 'anthropic'
  | 'deepseek'
  | 'perplexity'
  | 'qwen'
  | 'ollama'
  | 'bedrock';

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
  bedrock?: {
    region: string;
    roleArn: string;
    externalId: string;
    defaultModel: string;
    inferenceProfileArn?: string;
  };
};

// Bedrock — curated Claude models on Bedrock. Mirrors the BE BEDROCK_MODELS
// list so the FE dropdown stays in sync without a model-fetch roundtrip.
export const BEDROCK_MODELS: AIModel[] = [
  {
    id: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    name: 'Claude 3.5 Sonnet (Bedrock)',
    type: 'chat',
    contextWindow: 200000,
    description: 'Balanced cost + quality',
  },
  {
    id: 'anthropic.claude-3-haiku-20240307-v1:0',
    name: 'Claude 3 Haiku (Bedrock)',
    type: 'chat',
    contextWindow: 200000,
    description: 'Fast + cost-effective',
  },
  {
    id: 'anthropic.claude-3-opus-20240229-v1:0',
    name: 'Claude 3 Opus (Bedrock)',
    type: 'chat',
    contextWindow: 200000,
    description: 'Heaviest — best for complex reasoning',
  },
];

// Common AWS regions where Bedrock is available. Customer enters via dropdown
// so we don't accept arbitrary strings (typo-protection).
export const BEDROCK_REGIONS = [
  { value: 'us-east-1', label: 'us-east-1 (N. Virginia)' },
  { value: 'us-west-2', label: 'us-west-2 (Oregon)' },
  { value: 'eu-central-1', label: 'eu-central-1 (Frankfurt)' },
  { value: 'eu-west-1', label: 'eu-west-1 (Ireland)' },
  { value: 'ap-northeast-1', label: 'ap-northeast-1 (Tokyo)' },
  { value: 'ap-southeast-1', label: 'ap-southeast-1 (Singapore)' },
] as const;
