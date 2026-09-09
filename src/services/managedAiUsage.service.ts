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
  /**
   * Tokens in this tier no rate could price. Optional — an older backend omits it, and
   * the page must not render a coverage claim it does not have.
   */
  unpricedTokens?: number;
}

/** One recorded model's usage. Optional: it arrives with the backend that prices per model. */
export interface ManagedAiModelStat {
  model: string;
  tier: ManagedAiTier;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  requests: number;
  /** USD, or null when no rate applies to this model. Null is "unknown", never free. */
  costUsd: number | null;
  /**
   * Tokens of this model nothing charged for: all of them when there is no rate, or the
   * residual a list price could not reach (a provider's `total_tokens` beyond
   * prompt+completion). Optional — an older backend omits it.
   */
  unpricedTokens?: number;
  /** 'operator' = a configured tier rate; 'list' = the built-in vendor list price. */
  rateSource: 'operator' | 'list' | null;
}

export interface ManagedAiOrgUsage {
  organizationId: number;
  name: string;
  /**
   * Monthly AI-call cap consumption. Null when the org's limits could not be read.
   *
   * ⚠️ `month` (`YYYY-MM`) is the window this counter actually covers, and it is NOT the
   * `days` window the token columns answer: the cap is a calendar-month counter that
   * resets on the 1st. Optional because it arrives with the backend change that adds it —
   * an older API omits it, and the column must stay readable rather than render
   * `undefined`.
   */
  calls: { used: number; limit: number; remaining: number; month?: string } | null;
  totalTokens: number;
  byTier: ManagedAiTierStat[];
  /** Per-model rows, busiest first — what the `other`/Unpriced column is actually made of. */
  byModel?: ManagedAiModelStat[];
  costUsd?: number | null;
  unpricedTokens?: number;
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
    /**
     * The money figure and everything needed to read it honestly.
     *
     * Optional: a backend that predates it omits the block, and the page then falls back
     * to summing the per-tier estimates exactly as it did before. `pricedTokens` /
     * `unpricedTokens` are why this is a block and not a number — a cost with an unstated
     * hole in it is worse than the dash it replaced.
     */
    cost?: {
      usd: number | null;
      eur: number | null;
      usdToEur: number;
      /** True when nobody set `PLATFORM_USD_TO_EUR` — the euro figure is then a rough default. */
      usdToEurIsDefault: boolean;
      /** When the built-in list prices were captured. They are an estimate, not an invoice. */
      pricesAsOf: string;
      pricedTokens: number;
      unpricedTokens: number;
    };
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
