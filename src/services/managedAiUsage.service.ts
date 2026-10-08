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
/**
 * ⛔ `vision` is not optional here. The backend has reported four tiers since the fix that
 * added it (it is the token-heaviest managed tier — two images cost 76,826 tokens), and
 * this union listed three. The console rendered three columns to match, so vision spend
 * was invisible: kangtao showed 40,787,419 tokens against columns summing to ~9.7M,
 * and nothing on the page accounted for the other ~31M.
 */
export type ManagedAiTier = 'default' | 'strong' | 'vision' | 'other';

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
  /**
   * 'operator' = a configured platform tier rate (platform-key usage only); 'provider' = the
   * workspace's own provider rates (own-key usage only); 'list' = the built-in vendor list price.
   */
  rateSource: 'operator' | 'provider' | 'list' | null;
}

/**
 * `no_usage`: listed only for its token-limit override — nothing ran in the window, so no key paid
 * (and `calls` is null: no cap is read for it). Counted in none of the totals' key counts.
 */
export type SpendVia = 'managed_mode' | 'default_key' | 'own_key' | 'no_usage';

/** Where a daily limit came from — shown, so a built-in default is never taken for a decision. */
export type TokenLimitSource = 'workspace' | 'platform' | 'env' | 'default';

/** One daily token limit: tokens per UTC day, **0 = no limit**. */
export interface TokenLimit {
  limit: number;
  source: TokenLimitSource;
}

export type TokenBucket = 'kb' | 'regular';

/** A workspace's own override; a field absent follows the platform. */
export interface TokenLimitOverride {
  kbTokensPerDay?: number;
  regularTokensPerDay?: number;
}

/** One workspace's two daily limits and what it spent today (UTC). */
export interface OrgTokenBudget {
  kb: TokenLimit & { spentToday: number };
  regular: TokenLimit & { spentToday: number };
  override: TokenLimitOverride | null;
  /** False: own key with own-key enforcement off — measured and notified, never stopped. */
  enforced: boolean;
  /**
   * True: the workspace's AI settings or (BE R15) the platform limit settings could not be read,
   * or (BE R17) a fresh read of them succeeded but disagreed with the cached answer the gate used —
   * so `enforced` is not a settled reading; whether the limit stops work is unknown. Absent (older
   * BE) ⇒ false.
   */
  enforcementLookupFailed?: boolean;
}

export type TokenForecastLimit = TokenLimit;

export interface KbForecast {
  sources: Array<{
    sourceId: number;
    name: string;
    threadsInScope: number;
    threadsToMine: number;
    noCutoff: boolean;
  }>;
  threadsToMine: number;
  /** Measured on this workspace; null until enough threads were mined to say. */
  tokensPerThread: { value: number; threadsMeasured: number; windowDays: number } | null;
  estimatedTokens: number | null;
  /** UTC days at the KB limit, today included; null when not measured or no limit. */
  daysAtLimit: number | null;
  limit: TokenForecastLimit;
  spentToday: number;
  /**
   * Whether this workspace is stopped at the KB limit. Always sent: the forecast route exists only
   * on the backend that has the limits (tokenForecastService forecastKb).
   */
  enforced: boolean;
  /**
   * True: `enforced` is not a settled reading — the AI or platform limit settings could not be
   * read, or (BE R17) a fresh read disagreed with the cached answer the gate used.
   */
  enforcementLookupFailed: boolean;
  /**
   * BE R17: the saved limit settings could not be read — `limit` and `daysAtLimit` are the
   * fallback: the server environment setting when one is set, else the built-in default (named
   * from `limit.source`, fallbackLayer) — not this workspace's saved limit.
   */
  settingsLookupFailed: boolean;
  /**
   * KB image checks are told apart only since the token-limit split. `coversWindow: false` ⇒ the
   * cost per conversation leaves out image checks before `firstRecordedAt` (null: none recorded
   * yet), so the true cost may be higher. Absent from an older backend.
   */
  imageChecks?: { firstRecordedAt: string | null; coversWindow: boolean };
}

export interface RegularForecast {
  windowDays: number;
  /**
   * The days `messagesPerDay` and `actual.last7DaysAverage` are averaged over: `windowDays`, or
   * fewer when the workspace (or its mail) is younger than the window.
   */
  observedDays: number;
  messagesPerDay: { in: number; out: number };
  tokensPerMessage: { low: number; typical: number; high: number; weeksMeasured: number } | null;
  expectedTokensPerDay: { low: number; typical: number; high: number } | null;
  actual: { last7DaysAverage: number; peakDay: { date: string; tokens: number } | null };
  limit: TokenForecastLimit;
  spentToday: number;
  /** Whether this workspace is stopped at the regular limit. */
  enforced: boolean;
  /**
   * True: `enforced` is not a settled reading — the AI or platform limit settings could not be
   * read, or (BE R17) a fresh read disagreed with the cached answer the gate used.
   */
  enforcementLookupFailed: boolean;
  /**
   * BE R17: the saved limit settings could not be read — `limit` is the fallback: the server
   * environment setting when one is set, else the built-in default (named from `limit.source`,
   * fallbackLayer) — not this workspace's saved limit.
   */
  settingsLookupFailed: boolean;
}

export interface TokenForecast {
  organizationId: number;
  kb: KbForecast;
  regular: RegularForecast;
}

export interface ManagedAiOrgUsage {
  organizationId: number;
  name: string;
  /**
   * Which key paid: managed mode (platform key), its own AI settings holding the platform key
   * ("default key"), or its own key. Optional: an older backend listed managed mode only.
   */
  via?: SpendVia;
  platformKeyTokens?: number;
  ownKeyTokens?: number;
  /**
   * Monthly AI-call cap consumption. Null when the org's limits could not be read, and when no
   * cap is read for it at all (`via` own_key or no_usage — the cap governs the platform key).
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
  /** The two daily limits and today's spend. Absent on a backend before the split. */
  tokenBudget?: OrgTokenBudget;
}

export interface ManagedAiUsage {
  /** Managed workspaces, busiest first. Present but all-zero when nobody spent in range. */
  orgs: ManagedAiOrgUsage[];
  totals: {
    byTier: ManagedAiTierStat[];
    managedOrgCount: number;
    /**
     * All-spend split (newer backend). Undefined on an older backend that counted managed mode
     * only and could not see the rest — never read undefined as 0.
     */
    defaultKeyOrgCount?: number;
    ownKeyOrgCount?: number;
    platformKeyTokens?: number;
    ownKeyTokens?: number;
    /**
     * The daily TOKEN ceiling — the only guard that counts tokens rather than round-trips.
     * `tokenCeilingIsDefault` says whether an operator chose this number or is relying on
     * the built-in; 0 is a real opt-out, not "unset".
     */
    tokenCeilingPerOrgPerDay?: number;
    tokenCeilingIsDefault?: boolean;
    /**
     * The split limits (KB processing / regular work) at platform level, whether own-key
     * workspaces are stopped or only measured, and every workspace override. Absent on a
     * backend before the split — the page then shows the single ceiling above.
     */
    tokenBudgets?: {
      kb: TokenLimit;
      regular: TokenLimit;
      ownKeyEnforced: boolean;
      /**
       * BE R16: the stored limits could not be read — `kb`, `regular`, `ownKeyEnforced`, the
       * overrides and every workspace's limits are then the env/built-in FALLBACK, not the saved
       * limits. Absent from an older backend.
       */
      settingsLookupFailed?: boolean;
      workspaceOverrides: Record<string, TokenLimitOverride>;
    };
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
      /**
       * Workspaces whose own provider rates could not be read this time (their database did
       * not answer) — their own-key usage is at list prices. Absent on an older backend.
       */
      providerRatesUnreadableOrgIds?: number[];
    };
  };
}

export interface ManagedAiUsageMeta {
  from: string;
  to: string;
  days?: number;
}

/** What a save that lifted the KB limit released at once (BE `release`, owner decision D12). */
export interface TokenLimitRelease {
  /** Workspaces whose paused KB work was released. */
  releasedOrganizations: number[];
  /** Workspaces the KB limit still pauses now — the new limit is under today's KB spend. */
  stillPaused: number[];
  /** Parked per-conversation KB jobs moved to run now, in `releasedOrganizations`. */
  promotedKbJobs: number;
  /**
   * Parked per-conversation KB jobs moved to run now in `failedOrganizations` — they DO run now,
   * though a mine of the same workspace waits for the reset.
   */
  promotedKbJobsInFailedOrganizations: number;
  /** Paused mines restarted now. */
  resumedMines: number;
  /**
   * Paused mines that already had a resume queued (an earlier save, or one already running) — not
   * re-queued, but on their way.
   */
  minesAlreadyQueued: number;
  /** Paused work the backend could not queue — it waits for the reset. */
  failedToQueue: number;
  /**
   * Workspaces with a mine that could not be queued — NOT in `releasedOrganizations`, still
   * paused until the reset.
   */
  failedOrganizations: number[];
  /**
   * Workspaces with NO parked KB work (e.g. only consolidation was refused) that the KB limit no
   * longer pauses and whose limit notice the backend marked released. Not in
   * `releasedOrganizations`.
   */
  noticeOnlyOrganizations: number[];
  /**
   * Workspaces whose database could not be reached, or whose limit state (AI mode, today's spend,
   * the limits) could not be read (BE round 9): NOTHING was released for them (their paused
   * KB work waits for the reset, their notice is unchanged); the rest of the release went through.
   * Not in any other list.
   */
  unreachableOrganizations: number[];
  /**
   * Workspaces whose KB notice the backend marked PARTIAL: some of their paused KB work may still
   * wait for the reset (a bounded scan left some unread, or a promote failed). They may also be in
   * `releasedOrganizations`, or in no other list (a notice-only workspace whose scan was cut).
   * BE fix round 22 (C1); [] when the field is absent.
   */
  partialOrganizations: number[];
  /** A scan stopped at its bound — some paused work may still wait for the reset. */
  truncated: boolean;
}

/**
 * The `release` of a limit edit: `null` when the edit did not lift the KB limit (or the field is
 * absent), the backend's own sentence when the release failed, or what it released. The backend
 * from before the limits has no limit-save route at all, so every answer read here is the final
 * backend's.
 */
export type TokenLimitReleaseOutcome = TokenLimitRelease | { error: string } | null;

const numberList = (value: unknown): number[] =>
  Array.isArray(value) ? value.filter((item): item is number => typeof item === 'number') : [];

const count = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;

/** Tolerates a malformed answer (field absent ⇒ null, error, a list or count missing ⇒ empty). */
export const normaliseRelease = (value: unknown): TokenLimitReleaseOutcome => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.error === 'string') return { error: raw.error };
  return {
    releasedOrganizations: numberList(raw.releasedOrganizations),
    stillPaused: numberList(raw.stillPaused),
    promotedKbJobs: count(raw.promotedKbJobs),
    promotedKbJobsInFailedOrganizations: count(raw.promotedKbJobsInFailedOrganizations),
    resumedMines: count(raw.resumedMines),
    minesAlreadyQueued: count(raw.minesAlreadyQueued),
    failedToQueue: count(raw.failedToQueue),
    failedOrganizations: numberList(raw.failedOrganizations),
    noticeOnlyOrganizations: numberList(raw.noticeOnlyOrganizations),
    unreachableOrganizations: numberList(raw.unreachableOrganizations),
    partialOrganizations: numberList(raw.partialOrganizations),
    truncated: raw.truncated === true,
  };
};

/**
 * What a limit save did to the REGULAR limit's notices (BE round 12 `regularRelease`): the
 * workspaces whose enforced regular notice of today now says the limit no longer stops them, those
 * the new limit still stops, and those that could not be checked (their notice is unchanged).
 */
export interface RegularLimitRelease {
  releasedOrganizations: number[];
  stillStopped: number[];
  unreachableOrganizations: number[];
  /** The scan stopped at its bound — some notices were not checked. */
  truncated: boolean;
}

/**
 * `null` = nothing ran (the edit did not lift the regular limit, or a same-value re-save marked
 * nothing or failed); also read for an absent field.
 */
export type RegularLimitReleaseOutcome = RegularLimitRelease | { error: string } | null;

/** Tolerates every shape a backend may send (field absent ⇒ null, error, partial object). */
export const normaliseRegularRelease = (value: unknown): RegularLimitReleaseOutcome => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.error === 'string') return { error: raw.error };
  return {
    releasedOrganizations: numberList(raw.releasedOrganizations),
    stillStopped: numberList(raw.stillStopped),
    unreachableOrganizations: numberList(raw.unreachableOrganizations),
    truncated: raw.truncated === true,
  };
};

/** Both releases a limit save reports: the KB one (`release`) and the regular one. */
export interface TokenLimitSaveOutcome {
  release: TokenLimitReleaseOutcome;
  regularRelease: RegularLimitReleaseOutcome;
}

type ReleaseResponse = { data?: { release?: unknown; regularRelease?: unknown } };

const readSaveOutcome = (body: ReleaseResponse | undefined): TokenLimitSaveOutcome => ({
  release: normaliseRelease(body?.data?.release),
  regularRelease: normaliseRegularRelease(body?.data?.regularRelease),
});

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

  /** Platform limits. A number sets, `null` clears back to the default, absent leaves it. */
  updatePlatformLimits: async (edit: {
    kbTokensPerDay?: number | null;
    regularTokensPerDay?: number | null;
    ownKeyEnforced?: boolean;
  }): Promise<TokenLimitSaveOutcome> => {
    const response = await apiClient.patch<ReleaseResponse>(
      '/api/admin/platform/settings/token-budgets',
      edit
    );
    return readSaveOutcome(response?.data);
  },

  /**
   * One workspace's override. A number sets, `null` clears that limit, absent leaves it alone;
   * with both cleared the override goes and the workspace follows the platform.
   */
  updateWorkspaceLimits: async (
    organizationId: number,
    edit: { kbTokensPerDay?: number | null; regularTokensPerDay?: number | null }
  ): Promise<TokenLimitSaveOutcome> => {
    const response = await apiClient.put<ReleaseResponse>(
      `/api/admin/platform/settings/token-budgets/workspaces/${encodeURIComponent(String(organizationId))}`,
      edit
    );
    return readSaveOutcome(response?.data);
  },

  getForecast: async (organizationId: number): Promise<TokenForecast> => {
    const response = await apiClient.get<{ success: boolean; data: TokenForecast }>(
      `/api/admin/platform/token-forecast/${encodeURIComponent(String(organizationId))}`
    );
    return response.data.data;
  },
};
