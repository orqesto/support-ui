import { apiClient } from '@/lib/api-client';

/**
 * Platform rule library (global-admin console). The backend serves one row per reusable rule
 * template; there is no embedding vector in the response, only `hasEmbedding`.
 *
 * Plain TypeScript types, not a runtime schema: the front end carries no schema library, and a
 * type that lists every field the page reads gives the same protection against a renamed field.
 */
export const RULE_LIBRARY_FLOWS = [
  'spam',
  'detection',
  'categories',
  'prompts',
  'contradiction',
  'kb_detection',
  'priority',
  'response',
  'routing',
  'sla',
  'auto_reply',
  'capability',
] as const;
export type RuleLibraryFlow = (typeof RULE_LIBRARY_FLOWS)[number];

export interface RuleLibraryItem {
  id: number;
  flow: RuleLibraryFlow;
  seedKey: string | null;
  originPresetKey: string | null;
  name: string;
  description: string;
  purposeGroup: string | null;
  payload: Record<string, unknown>;
  hasEmbedding: boolean;
  embeddingModel: string | null;
  source: 'seed' | 'admin';
  active: boolean;
  createdAt: string;
  updatedAt: string;
  updatedBy: number | null;
}

export interface RuleLibraryList {
  items: RuleLibraryItem[];
  total: number;
  page: number;
  pageSize: number;
  countsByFlow: Record<RuleLibraryFlow, number>;
}

export interface RuleLibraryListParams {
  flow?: RuleLibraryFlow;
  q?: string;
  active?: boolean;
  missingDescription?: boolean;
  page?: number;
  pageSize?: number;
}

export interface RuleLibraryCreateBody {
  flow: RuleLibraryFlow;
  name: string;
  description: string;
  purposeGroup?: string;
  payload: Record<string, unknown>;
}

/** `flow` cannot change after creation. `updatedAt` is the optimistic-lock token (409 STALE_ITEM). */
export interface RuleLibraryUpdateBody {
  updatedAt: string;
  name?: string;
  description?: string;
  /** null clears the group (the backend rejects an empty string). */
  purposeGroup?: string | null;
  payload?: Record<string, unknown>;
  active?: boolean;
}

const PATH = '/api/admin/platform/rule-library';

type Envelope<T> = { success: boolean; data: T };

export const listLibraryItems = async (params: RuleLibraryListParams): Promise<RuleLibraryList> => {
  const res = await apiClient.get<Envelope<RuleLibraryList>>(PATH, { params });
  return res.data.data;
};

export const getLibraryItem = async (id: number): Promise<RuleLibraryItem> => {
  const res = await apiClient.get<Envelope<RuleLibraryItem>>(`${PATH}/${id}`);
  return res.data.data;
};

export const createLibraryItem = async (body: RuleLibraryCreateBody): Promise<RuleLibraryItem> => {
  const res = await apiClient.post<Envelope<RuleLibraryItem>>(PATH, body);
  return res.data.data;
};

export const updateLibraryItem = async (
  id: number,
  body: RuleLibraryUpdateBody
): Promise<RuleLibraryItem> => {
  const res = await apiClient.patch<Envelope<RuleLibraryItem>>(`${PATH}/${id}`, body);
  return res.data.data;
};

export const ruleLibraryService = {
  listLibraryItems,
  getLibraryItem,
  createLibraryItem,
  updateLibraryItem,
};
export type RuleLibraryService = typeof ruleLibraryService;
