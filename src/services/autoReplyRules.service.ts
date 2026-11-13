import { apiClient } from '@/lib/api-client';
import { getErrorBody } from '@/lib/errorMessages';
import type { ApiResponse } from '@/types';

/**
 * Keyword auto-reply rules (Settings → AI → Auto-Reply, BE 2026-11-13): keywords tied to a
 * prepared reply. A new customer email containing a keyword of exactly one enabled rule gets
 * that rule's reply; a match of two or more rules sends nothing.
 */
export type AutoReplyRule = {
  id: number;
  name: string;
  keywords: string[];
  replyText: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AutoReplyRuleInput = {
  name?: string;
  keywords?: string[];
  replyText?: string;
  enabled?: boolean;
};

/**
 * Tolerates a row missing a field (FE/BE skew): every field gets a safe value, so a list never
 * white-screens on `keywords.map`.
 */
const normalizeRule = (raw: Partial<AutoReplyRule> | null | undefined): AutoReplyRule | null => {
  if (!raw || typeof raw.id !== 'number') return null;
  const keywords = Array.isArray(raw.keywords)
    ? raw.keywords.filter((kw): kw is string => typeof kw === 'string')
    : [];
  return {
    id: raw.id,
    name: typeof raw.name === 'string' && raw.name ? raw.name : (keywords[0] ?? `Rule ${raw.id}`),
    keywords,
    replyText: typeof raw.replyText === 'string' ? raw.replyText : '',
    enabled: raw.enabled !== false,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : '',
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
  };
};

const BASE = '/api/organizations/auto-reply/rules';

export const autoReplyRulesService = {
  /** Empty on a backend without the route (404): the section then shows no rules. */
  list: async (): Promise<AutoReplyRule[]> => {
    const response = await apiClient.get<ApiResponse<Partial<AutoReplyRule>[]>>(BASE);
    const rows = Array.isArray(response.data.data) ? response.data.data : [];
    return rows.map(normalizeRule).filter((rule): rule is AutoReplyRule => rule !== null);
  },

  create: async (input: AutoReplyRuleInput): Promise<AutoReplyRule> => {
    const response = await apiClient.post<ApiResponse<Partial<AutoReplyRule>>>(BASE, input);
    const rule = normalizeRule(response.data.data);
    if (!rule) throw new Error('The server did not return the saved rule.');
    return rule;
  },

  update: async (id: number, input: AutoReplyRuleInput): Promise<AutoReplyRule> => {
    const response = await apiClient.patch<ApiResponse<Partial<AutoReplyRule>>>(
      `${BASE}/${id}`,
      input
    );
    const rule = normalizeRule(response.data.data);
    if (!rule) throw new Error('The server did not return the saved rule.');
    return rule;
  },

  remove: async (id: number): Promise<void> => {
    await apiClient.delete(`${BASE}/${id}`);
  },
};

/** The fields a 400 named (`fields: ['keywords', 'replyText']`), for the form's inline errors. */
export const ruleErrorFields = (err: unknown): string[] => {
  const fields = getErrorBody(err)?.fields;
  return Array.isArray(fields)
    ? fields.filter((field): field is string => typeof field === 'string')
    : [];
};
