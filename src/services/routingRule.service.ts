import { apiClient } from '@/lib/api-client';
import type { ApiResponse } from '@/types';

export const ROUTING_RULE_TYPES = [
  'subject_contains',
  'subject_regex',
  'sender_email',
  'sender_domain',
  'body_contains',
  'header_match',
] as const;
export type RoutingRuleType = (typeof ROUTING_RULE_TYPES)[number];

export type RoutingRuleProvenance =
  | 'seed'
  | 'admin_added'
  | 'admin_confirmed'
  | 'promoted'
  | 'consolidated_from'
  | 'fast_path';

export type RoutingRule = {
  id: number;
  departmentId: number;
  type: RoutingRuleType;
  value: string;
  exampleText: string | null;
  weight: number;
  enabled: boolean;
  lastMatchedAt: string | null;
  matchCount: number;
  createdAt: string;
  /** True when the rule was auto-materialized by the learning engine. */
  provisional?: boolean;
  /** Learning engine metadata (provenance, ledger, etc.). Null on legacy rows. */
  metadata?: {
    provenance?: RoutingRuleProvenance;
    outcomeLedger?: {
      corroborations: number;
      contradictions: number;
      distinctConvsCount: number;
    };
  } | null;
};

export type CreateRoutingRuleInput = {
  departmentId: number;
  type: RoutingRuleType;
  value: string;
  exampleText?: string;
  weight?: number;
  enabled?: boolean;
};

export type UpdateRoutingRuleInput = Partial<Omit<CreateRoutingRuleInput, 'departmentId'>>;

export const routingRuleService = {
  list: async (departmentId?: number) => {
    const url =
      departmentId !== undefined
        ? `/api/routing-rules?departmentId=${departmentId}`
        : '/api/routing-rules';
    const response = await apiClient.get<ApiResponse<RoutingRule[]>>(url);
    return response.data;
  },

  create: async (data: CreateRoutingRuleInput) => {
    const response = await apiClient.post<ApiResponse<RoutingRule>>('/api/routing-rules', data);
    return response.data;
  },

  update: async (id: number, data: UpdateRoutingRuleInput) => {
    const response = await apiClient.patch<ApiResponse<RoutingRule>>(
      `/api/routing-rules/${id}`,
      data
    );
    return response.data;
  },

  delete: async (id: number) => {
    const response = await apiClient.delete<ApiResponse<void>>(`/api/routing-rules/${id}`);
    return response.data;
  },
};
