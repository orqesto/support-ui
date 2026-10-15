/**
 * Rules-page view of a routing rule's lifecycle (spec ROUTING-PROPOSALS §4.4, D5).
 *
 * `lifecycle` is state only: `enabled` stays the routing gate. A missing lifecycle means an older
 * backend (the FE can ship first), so the rule reads as active, as every rule was before proposals.
 */
import type { RoutingRule } from '@/services/routingRule.service';

export type Lifecycle = 'proposed' | 'active' | 'declined' | 'archived';
export type RuleFilter = 'all' | 'manual' | 'learned' | 'proposed' | 'declined' | 'archived';

type LifecycleRule = Pick<RoutingRule, 'id' | 'departmentId' | 'provisional' | 'metadata'> & {
  lifecycle?: string | null;
};

export const ruleLifecycle = (rule: { lifecycle?: string | null }): Lifecycle =>
  rule.lifecycle === 'proposed' || rule.lifecycle === 'declined' || rule.lifecycle === 'archived'
    ? rule.lifecycle
    : 'active';

/** Accepted by a person (card or Rules page): BE writes provenance `admin_confirmed`. */
export const isApprovedRule = (rule: Pick<LifecycleRule, 'metadata'>): boolean =>
  rule.metadata?.provenance === 'admin_confirmed';

export const isLearnedRule = (rule: LifecycleRule): boolean =>
  ruleLifecycle(rule) === 'active' &&
  (rule.provisional || rule.metadata?.provenance === 'promoted' || isApprovedRule(rule));

export const RULE_FILTERS: RuleFilter[] = [
  'all',
  'manual',
  'learned',
  'proposed',
  'declined',
  'archived',
];

export const RULE_FILTER_LABEL: Record<RuleFilter, string> = {
  all: 'All',
  manual: 'Manual',
  learned: 'Learned',
  proposed: 'Proposed',
  declined: 'Declined',
  archived: 'Archived',
};

/** "All" leaves archived rules out: they are dormant history, shown under their own filter. */
export const matchesFilter = (rule: LifecycleRule, filter: RuleFilter): boolean => {
  const lifecycle = ruleLifecycle(rule);
  if (filter === 'all') return lifecycle !== 'archived';
  if (filter === 'manual') return lifecycle === 'active' && !isLearnedRule(rule);
  if (filter === 'learned') return isLearnedRule(rule);
  return lifecycle === filter;
};

/** D5: switching on a dormant rule is Accept, so the Rules page asks first. */
export const switchOnIsAccept = (rule: LifecycleRule & { enabled: boolean }): boolean =>
  !rule.enabled && ruleLifecycle(rule) !== 'active';

// The raw metadata carries more than the generated type models (the BE passes the JSONB through,
// routingRulesRoutes.ts list projection). Read the pair / group pointers with runtime checks.
const numberField = (source: unknown, key: string): number | null => {
  if (typeof source !== 'object' || source === null || !(key in source)) return null;
  const value: unknown = (source as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
};

/** The subject↔body pair partner (BE `metadata.siblingRuleId`, written on both rules). */
const partnerIdOf = (rule: LifecycleRule): number | null =>
  numberField(rule.metadata, 'siblingRuleId');

/** A sibling's anchor (BE `metadata.proposal.anchorRuleId`); an anchor is its own. */
const anchorIdOf = (rule: LifecycleRule): number =>
  numberField(rule.metadata?.proposal, 'anchorRuleId') ?? rule.id;

/** BE groupKeyOf: `proposal.groupId` of the anchor, else the anchor's id. */
const groupKeyOf = (anchor: LifecycleRule): number =>
  anchor.metadata?.proposal?.groupId ?? anchor.id;

/**
 * The card a Proposed badge links to. The BE writes `proposal.suggestionId` on the anchor only, so
 * a sibling links to its anchor's card when the list holds the anchor.
 */
export const proposalCardIdOf = <T extends LifecycleRule>(rule: T, rules: T[]): number | null => {
  const own = rule.metadata?.proposal?.suggestionId;
  if (typeof own === 'number') return own;
  const anchorId = anchorIdOf(rule);
  if (anchorId === rule.id) return null;
  const anchor = rules.find((candidate) => candidate.id === anchorId);
  return anchor?.metadata?.proposal?.suggestionId ?? null;
};

type AcceptEffects<T> = {
  /** Its pair partner, switched on with it (same department, not active yet). */
  partner: T | null;
  /** Proposed rules of the same pattern in other departments: Accept declines them. */
  declinedElsewhere: T[];
};

/**
 * What the BE does besides switching this rule on (routingProposalActions.ts
 * acceptRuleFromRulesPage: the anchor and its sibling go live when dormant and in this rule's
 * department; the rest of the pattern group is declined 'group_resolved'). Read from the list,
 * so it can only name rules the list returned.
 */
export const acceptEffectsOf = <T extends LifecycleRule>(rule: T, rules: T[]): AcceptEffects<T> => {
  const byId = new Map(rules.map((candidate) => [candidate.id, candidate]));
  const anchorId = anchorIdOf(rule);
  const anchor = byId.get(anchorId) ?? (anchorId === rule.id ? rule : null);
  const pairIds = [anchorId, partnerIdOf(rule), anchor ? partnerIdOf(anchor) : null];
  const partner =
    pairIds
      .filter((id): id is number => id !== null && id !== rule.id)
      .map((id) => byId.get(id))
      .find(
        (candidate): candidate is T =>
          candidate !== undefined &&
          candidate.departmentId === rule.departmentId &&
          ruleLifecycle(candidate) !== 'active'
      ) ?? null;
  const key = anchor ? groupKeyOf(anchor) : anchorId;
  const declinedElsewhere = rules.filter(
    (candidate) =>
      candidate.departmentId !== rule.departmentId &&
      ruleLifecycle(candidate) === 'proposed' &&
      anchorIdOf(candidate) === candidate.id &&
      (candidate.id === key || candidate.metadata?.proposal?.groupId === key)
  );
  return { partner, declinedElsewhere };
};
