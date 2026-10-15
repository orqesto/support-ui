import { apiClient } from '@/lib/api-client';
import { getErrorStatus } from '@/lib/errorMessages';

// Keep in sync with `src/shared/learning/learningService.ts` on the BE.
// Missing entries here cause silent type widening at the API boundary:
// the BE accepts `'detection'` / `'contradiction'` as valid filters, but
// FE callers passing those would have been rejected at compile time.
//
// Declared is NOT functional. Only the first group is registered in the engine,
// and even there most are 'planned' scaffolds (routing is the only 'live' loop;
// spam is 'partial'). The RESERVED group has no producer/consumer at all — the
// API accepts them for forward-compat, but they never emit a suggestion, so the
// UI never renders them. Do not present them as active learning.

/**
 * Per-domain evidence counts — how much signal a domain is actually receiving.
 * See `GET /api/learning/evidence`. Reports the INPUT, not health: a domain with
 * nothing arriving and a domain drowning in signal that produces nothing are
 * different problems, and neither used to be visible outside the database.
 */
export interface DomainEvidence {
  domain: string;
  /** What is being counted, so the number is never read as the wrong thing. */
  unit: string;
  count: number;
  lastAt: string | null;
  threshold?: { met: boolean; describe: string };
  note?: string;
}

export interface LearningEvidence {
  organizationId: number;
  windowDays: number;
  domains: DomainEvidence[];
}

export type LearningDomain =
  // Registered in the engine (functional status varies — see BE engine/types.ts):
  | 'routing' // live
  | 'spam' // partial
  | 'detection' // planned
  | 'contradiction' // planned
  | 'kb_quality' // planned
  | 'auto_reply' // planned
  | 'reply_style' // capture (P1) + propose (P3, flag-gated); accept rewrites the house-style prompt (P4)
  // Not an engine domain: a person's KB capture waiting for a reviewer. Accept approves the
  // entries, Decline rejects them (BE kbCaptureReview.ts).
  | 'kb_review'
  // RESERVED — no producer/consumer today; never emits a suggestion:
  | 'category'
  | 'suggested_reply'
  | 'auto_reply_block'
  | 'kb_extraction'
  | 'kb_scope'
  | 'sentiment'
  | 'lead'
  | 'multi_topic'
  | 'sla'
  | 'resolution_quality';

export type LearningSuggestion = {
  id: number;
  domain: LearningDomain;
  suggestionType: string;
  payload: Record<string, unknown>;
  evidenceEventIds: number[] | null;
  evidenceCount: number;
  confidence: string | null; // numeric → string from PG
  // 'reverted' = a KB consolidation case that was Unmerged (#873).
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'reverted';
  expiresAt: string;
  createdAt: string;
};

export type TrustMode = 'manual' | 'balanced' | 'aggressive';

export type TrustState = {
  trustScore: number;
  trustMode: TrustMode;
  trustModeSetAt: string;
  initialGraceUntil: string;
  effectiveMode: TrustMode;
  thresholdMultiplier: number;
  inInitialGrace: boolean;
};

export type LearningAutoActionType =
  | 'promote'
  | 'consolidate'
  | 'disable_provisional'
  | 'delete_provisional'
  // A routing proposal the engine accepted on its own (balanced / aggressive trust mode).
  | 'auto_accept';

export type LearningNotification = {
  id: number;
  organizationId: number;
  domain: string;
  actionType: LearningAutoActionType;
  ruleTable: string;
  ruleId: number;
  summary: string;
  evidence: Record<string, unknown>;
  undoAvailableUntil: string;
  createdAt: string;
};

export type SuggestionEvidenceItem = {
  messageId: number;
  conversationId: number;
  conversationPublicId: string | null;
  subject: string | null;
  contentExcerpt: string;
  ruleAMatched: boolean;
  ruleBMatched: boolean;
};

export type SuggestionEvidenceResponse = {
  evidence: SuggestionEvidenceItem[];
  ruleA: { id: number; type: string; value: string } | null;
  ruleB: { id: number; type: string; value: string } | null;
  /**
   * Number of recent message_events the fallback scan walked when the
   * suggestion's stored evidenceEventIds was empty. null when stored ids were
   * used (no fallback scan ran). Lets the UI differentiate "no traffic yet"
   * (scannedCount === 0) from "scanned N messages, none co-matched"
   * (scannedCount > 0; often signals a false-positive conflict).
   */
  scannedCount?: number | null;
  /** Fallback-scan rows on which a rule's pattern could not be checked. null on the stored-id path. */
  skippedCount?: number | null;
  /**
   * Conflict evidence rows withheld from a department-scoped caller (counted, not shown).
   * null = not counted (the fallback scan reads only the caller's departments); absent on an
   * older backend and on routing proposal cards (whose counts are per department, below).
   */
  redactedCount?: number | null;
  /** Routing proposal cards only; null for every other card and from an older backend. */
  proposal?: RoutingProposalEvidence | null;
};

export const ROUTING_PROPOSAL_TYPES = [
  'propose_rule',
  'resolve_routing_disagreement',
  'confirm_learned_rule',
] as const;
export type RoutingProposalType = (typeof ROUTING_PROPOSAL_TYPES)[number];
export const isRoutingProposal = (suggestion: { domain: string; suggestionType: string }): boolean =>
  suggestion.domain === 'routing' &&
  (ROUTING_PROPOSAL_TYPES as readonly string[]).includes(suggestion.suggestionType);

/** Mirrors the BE `ReplaySummary` (learning/engine/types.ts). */
export type ReplaySummary = {
  matches: number;
  inDepartment: number;
  ratio: number | null;
  lookbackDays: number;
  /** null when the backend sent no valid time — never rendered as the epoch. */
  at: string | null;
  /** Rows whose pattern test did not run; any skip withholds the recommendation. */
  skipped: number;
  /** The replay hit its row cap: `matches` is a lower bound ("at least N"). */
  truncated: boolean;
  recommendation: 'recommended' | 'review' | 'not_recommended' | null;
};
export type ProposalConversation = {
  conversationId: number;
  publicId: string | null;
  subject: string | null;
  departmentId: number | null;
  routedBy: { id: number; name: string } | null;
  /** null when the support entry carries no valid time (never the epoch). */
  routedAt: string | null;
};
export type ProposalWarnOverlap = { ruleId: number; departmentId: number; similarity: number };
export type ProposalSiblingRule = { ruleId: number; type: string; value: string };
export type ProposalDepartmentEvidence = {
  departmentId: number;
  ruleId: number;
  /** The paired rule (subject/body) that Accept, Keep and Switch off also act on; null for a single rule. */
  sibling: ProposalSiblingRule | null;
  /** Weighted conversation count (a bulk route weighs less than 1). */
  supportCount: number;
  agents: number;
  firstAt: string | null;
  lastAt: string | null;
  conversations: ProposalConversation[];
  /** Conversations outside the caller's departments: counted, not shown. */
  redactedCount: number;
  contradictions: Array<{ departmentId: number; count: number }>;
  replay: ReplaySummary | null;
  /** This department's rule overlaps a live rule of another department (warn band). */
  warnOverlap: ProposalWarnOverlap | null;
};
export type RoutingProposalEvidence = {
  kind: RoutingProposalType;
  departments: ProposalDepartmentEvidence[];
  autoAccept: { mode: TrustMode; eligibleInBalanced: boolean };
};

const isObj = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const num = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const strOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null);
/** An ISO time the card can render; anything unparsable ⇒ null (never "Invalid Date" / epoch). */
const timeOrNull = (value: unknown): string | null =>
  typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;

const toConversation = (raw: unknown): ProposalConversation | null => {
  if (!isObj(raw) || !num(raw.conversationId)) return null;
  const by =
    isObj(raw.routedBy) && num(raw.routedBy.id) && typeof raw.routedBy.name === 'string'
      ? { id: raw.routedBy.id, name: raw.routedBy.name }
      : null;
  return {
    conversationId: raw.conversationId,
    publicId: strOrNull(raw.publicId),
    subject: strOrNull(raw.subject),
    departmentId: num(raw.departmentId) ? raw.departmentId : null,
    routedBy: by,
    routedAt: timeOrNull(raw.routedAt),
  };
};

const toReplay = (raw: unknown): ReplaySummary | null => {
  if (!isObj(raw) || !num(raw.matches) || !num(raw.inDepartment) || !num(raw.lookbackDays)) return null;
  const rec = raw.recommendation;
  return {
    matches: raw.matches,
    inDepartment: raw.inDepartment,
    ratio: num(raw.ratio) ? raw.ratio : null,
    lookbackDays: raw.lookbackDays,
    at: timeOrNull(raw.at),
    skipped: num(raw.skipped) ? raw.skipped : 0,
    truncated: raw.truncated === true,
    recommendation: rec === 'recommended' || rec === 'review' || rec === 'not_recommended' ? rec : null,
  };
};

const toSibling = (raw: unknown): ProposalSiblingRule | null =>
  isObj(raw) && num(raw.ruleId) && typeof raw.type === 'string' && typeof raw.value === 'string'
    ? { ruleId: raw.ruleId, type: raw.type, value: raw.value }
    : null;

const toWarnOverlap = (raw: unknown): ProposalWarnOverlap | null =>
  isObj(raw) && num(raw.ruleId) && num(raw.departmentId) && num(raw.similarity)
    ? { ruleId: raw.ruleId, departmentId: raw.departmentId, similarity: raw.similarity }
    : null;

/** The `proposal` block of the evidence response; anything else (older backend) ⇒ null. */
export const normalizeProposalEvidence = (raw: unknown): RoutingProposalEvidence | null => {
  if (
    !isObj(raw) ||
    !(ROUTING_PROPOSAL_TYPES as readonly unknown[]).includes(raw.kind) ||
    !Array.isArray(raw.departments)
  ) {
    return null;
  }
  const departments = raw.departments.flatMap((dept): ProposalDepartmentEvidence[] => {
    if (!isObj(dept) || !num(dept.departmentId) || !num(dept.ruleId)) return [];
    return [
      {
        departmentId: dept.departmentId,
        ruleId: dept.ruleId,
        sibling: toSibling(dept.sibling),
        supportCount: num(dept.supportCount) ? dept.supportCount : 0,
        agents: num(dept.agents) ? dept.agents : 0,
        firstAt: timeOrNull(dept.firstAt),
        lastAt: timeOrNull(dept.lastAt),
        conversations: Array.isArray(dept.conversations)
          ? dept.conversations
              .map(toConversation)
              .filter((row): row is ProposalConversation => row !== null)
          : [],
        redactedCount: num(dept.redactedCount) ? dept.redactedCount : 0,
        contradictions: Array.isArray(dept.contradictions)
          ? dept.contradictions
              .filter((entry): entry is { departmentId: number; count: number } =>
                isObj(entry) && num(entry.departmentId) && num(entry.count)
              )
              .map((entry) => ({ departmentId: entry.departmentId, count: entry.count }))
          : [],
        replay: toReplay(dept.replay),
        warnOverlap: toWarnOverlap(dept.warnOverlap),
      },
    ];
  });
  const auto = isObj(raw.autoAccept) ? raw.autoAccept : {};
  const mode: TrustMode = auto.mode === 'balanced' || auto.mode === 'aggressive' ? auto.mode : 'manual';
  return {
    kind: raw.kind as RoutingProposalType,
    departments,
    autoAccept: { mode, eligibleInBalanced: auto.eligibleInBalanced === true },
  };
};

export const learningService = {
  /**
   * How much signal each learning domain is receiving for this workspace.
   *
   * Returns null when the backend does not have the route yet, rather than
   * throwing: the frontend deploys on a push to main while the backend ships on
   * its own train, so this call can reach production before the endpoint does.
   * A missing panel is the right outcome there — an error box would report a
   * version skew as a fault in the workspace.
   */
  async getEvidence(): Promise<LearningEvidence | null> {
    try {
      const response = await apiClient.get<{ success: boolean; data: LearningEvidence }>(
        '/api/learning/evidence'
      );
      return response.data.data ?? null;
    } catch (err) {
      if (getErrorStatus(err) === 404) return null;
      throw err;
    }
  },

  async listSuggestions(domain?: LearningDomain): Promise<LearningSuggestion[]> {
    const params: Record<string, string> = {};
    if (domain) params.domain = domain;
    const response = await apiClient.get<{
      success: boolean;
      data: { suggestions: LearningSuggestion[] };
    }>('/api/learning/suggestions', { params });
    return response.data.data?.suggestions ?? [];
  },

  async getSuggestionEvidence(id: number): Promise<SuggestionEvidenceResponse> {
    const response = await apiClient.get<{
      success: boolean;
      data: SuggestionEvidenceResponse;
    }>(`/api/learning/suggestions/${id}/evidence`);
    const data = response.data.data;
    if (!data) return { evidence: [], ruleA: null, ruleB: null, scannedCount: null, proposal: null };
    return { ...data, proposal: normalizeProposalEvidence((data as { proposal?: unknown }).proposal) };
  },

  /**
   * `body.departmentId` picks the department a disagreement card is accepted for (BE
   * acceptSuggestionRoute); every other card is accepted with no department.
   */
  async acceptSuggestion(id: number, body?: { departmentId?: number }): Promise<void> {
    await apiClient.post(`/api/learning/suggestions/${id}/accept`, body ?? {});
  },

  async declineSuggestion(id: number, reason?: string): Promise<void> {
    await apiClient.post(`/api/learning/suggestions/${id}/decline`, reason ? { reason } : {});
  },

  // Tighten one rule of a routing conflict in place (the "Refine" action) —
  // resolves the conflict without disabling either rule.
  async editRule(id: number, target: 'A' | 'B', value: string): Promise<void> {
    await apiClient.post(`/api/learning/suggestions/${id}/edit-rule`, { target, value });
  },

  async getTrustState(): Promise<TrustState> {
    const response = await apiClient.get<{ success: boolean; data: TrustState }>(
      '/api/learning/trust'
    );
    if (!response.data?.data) throw new Error('Malformed trust state response');
    return response.data.data;
  },

  async setTrustMode(mode: TrustMode): Promise<TrustState> {
    const response = await apiClient.patch<{ success: boolean; data: TrustState }>(
      '/api/learning/trust',
      { mode }
    );
    if (!response.data?.data) throw new Error('Malformed trust state response');
    return response.data.data;
  },

  async listNotifications(): Promise<LearningNotification[]> {
    const response = await apiClient.get<{
      success: boolean;
      data: { notifications: LearningNotification[] };
    }>('/api/learning/notifications');
    return response.data.data?.notifications ?? [];
  },

  async undoNotification(id: number): Promise<void> {
    await apiClient.post(`/api/learning/notifications/${id}/undo`);
  },

  async runEngine(): Promise<EngineRunSummary> {
    const response = await apiClient.post<{
      success: boolean;
      data: EngineRunSummary;
    }>('/api/learning/run');
    if (!response.data?.data) throw new Error('Malformed run-engine response');
    return response.data.data;
  },
};

export type DomainPassSummary = {
  domain: string;
  pass1RulesScored: number;
  pass3Promoted: number;
  pass3Disabled: number;
  pass3SuggestionsEmitted: number;
  pass4ConflictsDetected: number;
  pass4ConflictsEmitted: number;
  error?: string;
};

export type EngineRunSummary = {
  runId: string;
  organizationId: number;
  durationMs: number;
  trustMode: TrustMode;
  thresholdMultiplier: number;
  domains: DomainPassSummary[];
};
