import { apiClient } from '@/lib/api-client';
import { getErrorBody, getErrorStatus } from '@/lib/errorMessages';
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
  /** Template + knowledge base (BE 2026-11-13); absent on an older backend → false. */
  useKnowledgeBase: boolean;
  /**
   * Template + KB: how close (0.80–0.99) the customer's question must be to the knowledge source
   * (BE 2026-11-16, audit M5). Absent on an older backend → the default.
   */
  kbMinSimilarity: number;
  /**
   * Keywords the backend skips when matching: too short or too common (a rule saved before that
   * check, BE 2026-11-17). Absent on an older backend → none.
   */
  ignoredKeywords: string[];
  /**
   * What the rule does to the thread once its reply is sent (BE 2026-11-27): resolve it, or
   * `pending` — the reply counts as the first response and the thread waits on the customer, back
   * to the team when they write. Absent or unknown (an older backend) → 'resolve' (what it always did).
   */
  afterReply: AfterReply;
  createdAt: string;
  updatedAt: string;
};

export type AfterReply = 'resolve' | 'pending';

export type AutoReplyRuleInput = {
  name?: string;
  keywords?: string[];
  replyText?: string;
  enabled?: boolean;
  useKnowledgeBase?: boolean;
  /** null = the default. */
  kbMinSimilarity?: number | null;
  /** Omitted on create → 'resolve'; omitted on update → unchanged. */
  afterReply?: AfterReply;
};

/** The backend's default knowledge base match (autoReplyRulesService KB_MATCH_DEFAULT). */
export const KB_MATCH_DEFAULT = 0.87;

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
    useKnowledgeBase: raw.useKnowledgeBase === true,
    kbMinSimilarity:
      typeof raw.kbMinSimilarity === 'number' ? raw.kbMinSimilarity : KB_MATCH_DEFAULT,
    ignoredKeywords: Array.isArray(raw.ignoredKeywords)
      ? raw.ignoredKeywords.filter((kw): kw is string => typeof kw === 'string')
      : [],
    afterReply: raw.afterReply === 'pending' ? 'pending' : 'resolve',
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

/**
 * The server's own words for a 400 on a rule, for under the field — none for the generic
 * "Validation error" (a schema refusal says nothing a person can act on; the field default does).
 */
export const ruleErrorMessage = (err: unknown): string | undefined => {
  if (getErrorStatus(err) !== 400) return undefined;
  const message = getErrorBody(err)?.error;
  if (typeof message !== 'string' || !message.trim() || message.trim() === 'Validation error')
    return undefined;
  return message.trim();
};

/** The fields a 400 named (`fields: ['keywords', 'replyText']`), for the form's inline errors. */
export const ruleErrorFields = (err: unknown): string[] => {
  const fields = getErrorBody(err)?.fields;
  return Array.isArray(fields)
    ? fields.filter((field): field is string => typeof field === 'string')
    : [];
};
