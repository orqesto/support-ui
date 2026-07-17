// Runtime-iterable list of AI provider type strings. `AIProvider` derives
// from this so adding a provider here extends the type automatically — and
// FE branches like "is this an AI provider?" can use the same source of
// truth instead of restating the list inline (which drifts; saw `'custom'`
// missing from AIProvidersSettings auto-disable logic on 2026-06-15).
// Mirrors BE be/src/types/aiProviders.ts.
export const AI_PROVIDER_TYPES = [
  'openai',
  'anthropic',
  'deepseek',
  'perplexity',
  'qwen',
  'ollama',
  'bedrock',
  'custom',
] as const;

export type AIProvider = (typeof AI_PROVIDER_TYPES)[number];

export const isAIProviderType = (value: string): value is AIProvider =>
  (AI_PROVIDER_TYPES as readonly string[]).includes(value);

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

// Curated cross-family Bedrock catalog. Mirrors BE be/types/aiProviders.ts
// so the FE dropdown renders without an AWS round-trip. The adapter accepts
// ANY model id Bedrock recognises — paste a custom one via the inference
// profile field if the customer's region exposes a model not in this list.
//
// Region availability varies; AWS surfaces "model not enabled" errors at
// invoke time which Test Connection reports with structured errorStep.
export const BEDROCK_MODELS: AIModel[] = [
  // Anthropic Claude
  // Haiku 4.5 on-demand is generally served via a cross-region inference
  // profile (the `eu.`-prefixed id) rather than the bare foundation model —
  // both are listed so you can pick whichever your IAM role is scoped to.
  { id: 'eu.anthropic.claude-haiku-4-5-20251001-v1:0', name: 'Claude Haiku 4.5 (EU cross-region)', type: 'chat', contextWindow: 200000, description: 'Anthropic — latest Haiku, EU inference profile' },
  { id: 'anthropic.claude-haiku-4-5-20251001-v1:0',    name: 'Claude Haiku 4.5',                   type: 'chat', contextWindow: 200000, description: 'Anthropic — latest Haiku, foundation model' },
  { id: 'anthropic.claude-3-5-sonnet-20241022-v2:0', name: 'Claude 3.5 Sonnet', type: 'chat', contextWindow: 200000, description: 'Anthropic — balanced cost + quality' },
  { id: 'anthropic.claude-3-5-haiku-20241022-v1:0',  name: 'Claude 3.5 Haiku',  type: 'chat', contextWindow: 200000, description: 'Anthropic — fast + cheap' },
  { id: 'anthropic.claude-3-opus-20240229-v1:0',     name: 'Claude 3 Opus',     type: 'chat', contextWindow: 200000, description: 'Anthropic — heaviest reasoning' },
  { id: 'anthropic.claude-3-haiku-20240307-v1:0',    name: 'Claude 3 Haiku',    type: 'chat', contextWindow: 200000, description: 'Anthropic — fastest generation' },

  // Meta Llama
  { id: 'meta.llama3-3-70b-instruct-v1:0', name: 'Llama 3.3 70B Instruct', type: 'chat', contextWindow: 128000, description: 'Meta — latest 70B, GPT-4o-class' },
  { id: 'meta.llama3-1-70b-instruct-v1:0', name: 'Llama 3.1 70B Instruct', type: 'chat', contextWindow: 128000, description: 'Meta — strong general-purpose' },
  { id: 'meta.llama3-1-8b-instruct-v1:0',  name: 'Llama 3.1 8B Instruct',  type: 'chat', contextWindow: 128000, description: 'Meta — small + fast' },

  // Amazon Nova
  { id: 'amazon.nova-pro-v1:0',   name: 'Amazon Nova Pro',   type: 'chat', contextWindow: 300000, description: 'Amazon — flagship, multimodal' },
  { id: 'amazon.nova-lite-v1:0',  name: 'Amazon Nova Lite',  type: 'chat', contextWindow: 300000, description: 'Amazon — cost-effective multimodal' },
  { id: 'amazon.nova-micro-v1:0', name: 'Amazon Nova Micro', type: 'chat', contextWindow: 128000, description: 'Amazon — ultra-fast text-only' },

  // Mistral
  { id: 'mistral.mistral-large-2407-v1:0',     name: 'Mistral Large 2407',    type: 'chat', contextWindow: 128000, description: 'Mistral — flagship reasoning + tools' },
  { id: 'mistral.mixtral-8x7b-instruct-v0:1',  name: 'Mixtral 8x7B Instruct', type: 'chat', contextWindow: 32000,  description: 'Mistral — sparse MoE' },

  // Cohere Command
  { id: 'cohere.command-r-plus-v1:0', name: 'Cohere Command R+', type: 'chat', contextWindow: 128000, description: 'Cohere — RAG + tools, multilingual' },
  { id: 'cohere.command-r-v1:0',      name: 'Cohere Command R',  type: 'chat', contextWindow: 128000, description: 'Cohere — smaller R, lower cost' },

  // AI21 Jamba
  { id: 'ai21.jamba-1-5-large-v1:0', name: 'AI21 Jamba 1.5 Large', type: 'chat', contextWindow: 256000, description: 'AI21 — hybrid SSM, very long context' },

  // DeepSeek
  { id: 'us.deepseek.r1-v1:0', name: 'DeepSeek R1 (US cross-region)', type: 'chat', contextWindow: 128000, description: 'DeepSeek — strong reasoning, US profile' },

  // Embeddings (used via direct InvokeModel, not Converse)
  { id: 'amazon.titan-embed-text-v2:0',     name: 'Titan Text Embeddings v2',  type: 'embedding', contextWindow: 8192, description: 'Amazon — 1024-dim, multilingual, cheapest' },
  { id: 'cohere.embed-multilingual-v3',     name: 'Cohere Embed Multilingual', type: 'embedding', contextWindow: 512,  description: 'Cohere — 1024-dim, 100+ languages' },
  { id: 'cohere.embed-english-v3',          name: 'Cohere Embed English',      type: 'embedding', contextWindow: 512,  description: 'Cohere — 1024-dim, English-only, highest quality' },
];

// AWS regions where Bedrock is generally available. Customer picks from
// the dropdown so we don't accept arbitrary strings (typo-protection).
// Model availability varies by region — AWS surfaces "model not enabled"
// errors at invoke time which Test Connection reports structured.
//
// Source: https://docs.aws.amazon.com/bedrock/latest/userguide/bedrock-regions.html
export const BEDROCK_REGIONS = [
  // US
  { value: 'us-east-1',      label: 'us-east-1 (N. Virginia)' },
  { value: 'us-east-2',      label: 'us-east-2 (Ohio)' },
  { value: 'us-west-2',      label: 'us-west-2 (Oregon)' },
  // Canada
  { value: 'ca-central-1',   label: 'ca-central-1 (Central Canada)' },
  // Europe
  { value: 'eu-central-1',   label: 'eu-central-1 (Frankfurt)' },
  { value: 'eu-west-1',      label: 'eu-west-1 (Ireland)' },
  { value: 'eu-west-2',      label: 'eu-west-2 (London)' },
  { value: 'eu-west-3',      label: 'eu-west-3 (Paris)' },
  { value: 'eu-north-1',     label: 'eu-north-1 (Stockholm)' },
  // Asia-Pacific
  { value: 'ap-northeast-1', label: 'ap-northeast-1 (Tokyo)' },
  { value: 'ap-northeast-2', label: 'ap-northeast-2 (Seoul)' },
  { value: 'ap-south-1',     label: 'ap-south-1 (Mumbai)' },
  { value: 'ap-southeast-1', label: 'ap-southeast-1 (Singapore)' },
  { value: 'ap-southeast-2', label: 'ap-southeast-2 (Sydney)' },
  // South America
  { value: 'sa-east-1',      label: 'sa-east-1 (São Paulo)' },
] as const;
