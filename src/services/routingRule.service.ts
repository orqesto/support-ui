import { apiClient } from '@/lib/api-client';
import type { ApiResponse } from '@/types';
// Rule shape generated from the backend contract (adds `tier`, present only on the
// dept-filtered projection; metadata narrowed to the fields the FE consumes).
import type { RoutingRule } from '@/types/api';

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

export type { RoutingRule };

export type CreateRoutingRuleInput = {
  departmentId: number;
  type: RoutingRuleType;
  value: string;
  exampleText?: string;
  weight?: number;
  enabled?: boolean;
};

export type UpdateRoutingRuleInput = Partial<
  Omit<CreateRoutingRuleInput, 'departmentId' | 'exampleText'>
> & {
  // `null` is "clear the example text" — turns the rule deterministic-only.
  exampleText?: string | null;
};

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
