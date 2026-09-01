import { apiClient } from '@/lib/api-client';

/**
 * Platform-key AI spend, per workspace.
 *
 * Every client workspace runs `aiMode: 'managed'`, which means their AI calls are billed
 * to the platform's own provider key rather than to a key they own. The backend has
 * reported this since P1.D5 (`GET /api/organizations/managed-ai-usage`, requireGlobalAdmin)
 * — nothing in the app ever asked for it, so the spend was capped but invisible.
 */

/** `default` = the cheap tier, `strong` = escalation, `other` = a model we have no rate for. */
export type ManagedAiTier = 'default' | 'strong' | 'other';

export interface ManagedAiTierStat {
  tier: ManagedAiTier;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  requests: number;
  /**
   * Currency units, or **null when no `PLATFORM_AI_*_COST_PER_1K` rate is configured** —
   * and for the `other` tier, always null. Null is "we cannot say", never zero: rendering
   * an unpriced tier as 0.00 is the difference between "free" and "unknown".
   */
  costEstimate: number | null;
}

export interface ManagedAiOrgUsage {
  organizationId: number;
  name: string;
  /** Monthly AI-call cap consumption. Null when the org's limits could not be read. */
  calls: { used: number; limit: number; remaining: number } | null;
  totalTokens: number;
  byTier: ManagedAiTierStat[];
}

export interface ManagedAiUsage {
  /** Managed workspaces, busiest first. Present but all-zero when nobody spent in range. */
  orgs: ManagedAiOrgUsage[];
  totals: {
    byTier: ManagedAiTierStat[];
    managedOrgCount: number;
    /**
     * The daily TOKEN ceiling — the only guard that counts tokens rather than round-trips.
     * `tokenCeilingIsDefault` says whether an operator chose this number or is relying on
     * the built-in; 0 is a real opt-out, not "unset".
     */
    tokenCeilingPerOrgPerDay?: number;
    tokenCeilingIsDefault?: boolean;
  };
}

export interface ManagedAiUsageMeta {
  from: string;
  to: string;
  days?: number;
}

export interface ManagedAiUsageResult {
  usage: ManagedAiUsage;
  meta: ManagedAiUsageMeta;
}

export const managedAiUsageService = {
  get: async (days: number): Promise<ManagedAiUsageResult> => {
    const response = await apiClient.get<{
      success: boolean;
      data: ManagedAiUsage;
      meta: ManagedAiUsageMeta;
    }>(`/api/organizations/managed-ai-usage?days=${encodeURIComponent(String(days))}`);
    return { usage: response.data.data, meta: response.data.meta };
  },
};
