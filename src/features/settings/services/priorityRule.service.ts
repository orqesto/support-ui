import { apiClient } from '@/lib/api-client';
import { getErrorStatus } from '@/lib/errorMessages';
import type { ApiResponse } from '@/types';

export const PRIORITY_LEVELS = ['critical', 'high', 'medium', 'low'] as const;
export type PriorityLevel = (typeof PRIORITY_LEVELS)[number];

export type PriorityRule = {
  id: number;
  priority: PriorityLevel;
  name: string;
  description: string;
  /**
   * The text that is EMBEDDED and compared against incoming mail. Priority is
   * matched semantically, not by keyword, so this should read like real customer
   * messages. `pattern` exists on the table but priority detection never reads it,
   * so it is not surfaced here.
   */
  exampleText: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type CreatePriorityRuleInput = {
  priority: PriorityLevel;
  name: string;
  description: string;
  exampleText: string;
  active?: boolean;
};

export type UpdatePriorityRuleInput = Partial<CreatePriorityRuleInput>;

/**
 * Thrown when the deployed backend has no /api/priority-rules yet.
 *
 * This repo deploys on a push to `main` while BE-service ships on a version tag, so
 * the frontend routinely reaches production BEFORE a coupled backend change. Callers
 * render an explanatory notice instead of letting an unhandled 404 white-screen the
 * settings page.
 */
export class PriorityRulesUnavailableError extends Error {
  constructor() {
    super('Priority rules are not available on this backend version yet');
    this.name = 'PriorityRulesUnavailableError';
  }
}

// Read the status via getErrorStatus, never off `.response`: the api-client
// interceptor rejects with a FRESH Error carrying `status`/`data` and no
// `.response` at all, so an axios-shaped check type-checks, reads correctly, and
// silently never matches. See src/lib/__tests__/errorShape.test.ts.
const isNotFound = (error: unknown): boolean => getErrorStatus(error) === 404;

export const priorityRuleService = {
  list: async (): Promise<PriorityRule[]> => {
    try {
      const response =
        await apiClient.get<ApiResponse<PriorityRule[]>>('/api/priority-rules');
      // Tolerate both `{data: [...]}` and a bare array — the settings page must not
      // crash if the envelope shape differs from what this build expects.
      const payload = response.data as unknown;
      if (Array.isArray(payload)) return payload as PriorityRule[];
      return (payload as ApiResponse<PriorityRule[]>)?.data ?? [];
    } catch (error) {
      if (isNotFound(error)) throw new PriorityRulesUnavailableError();
      throw error;
    }
  },

  create: async (data: CreatePriorityRuleInput) => {
    const response = await apiClient.post<ApiResponse<PriorityRule>>(
      '/api/priority-rules',
      data
    );
    return response.data;
  },

  update: async (id: number, data: UpdatePriorityRuleInput) => {
    const response = await apiClient.patch<ApiResponse<PriorityRule>>(
      `/api/priority-rules/${id}`,
      data
    );
    return response.data;
  },

  delete: async (id: number) => {
    const response = await apiClient.delete<ApiResponse<void>>(`/api/priority-rules/${id}`);
    return response.data;
  },
};
