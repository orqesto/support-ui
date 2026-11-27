import type { TeamRole } from '../../services/teamBuilder.service';

/** Plain-language names for the team roles. */
export const TEAM_ROLE_LABELS: Record<TeamRole, string> = {
  generalRules: 'General rules',
  billingExtraction: 'Billing details',
  receivesPromotional: 'Promotional mail',
  analysisPreferred: 'Preferred for analysis',
  intentRouted: 'Routed by intent',
};

/**
 * Flow names. A copy of the rule library's `FLOW_LABELS`, on purpose: settings must not import
 * from `features/rule-library` (module boundary). The team page adds `sla`.
 */
export const TEAM_FLOW_LABELS: Record<string, string> = {
  spam: 'Spam',
  detection: 'Detection',
  categories: 'Categories',
  prompts: 'Prompts',
  contradiction: 'Contradiction',
  kb_detection: 'KB detection',
  priority: 'Priority',
  response: 'Response',
  routing: 'Routing',
  sla: 'SLA',
  auto_reply: 'Auto reply',
  capability: 'Capability',
};

/** Shown for a team made from a preset (`notice: 'rules_only_until_traffic'`). */
export const NEW_TEAM_NOTICE_TEXT =
  'This team starts with rules only. It learns from real mail once threads reach it.';

/** Shown for the warning `NO_ROUTING_RULES`. */
export const NO_ROUTING_RULES_TEXT =
  'No routing rules came with it, so no mail reaches this team yet. Add routing rules from the library, or move threads to it by hand.';

/** "<Role> is held by <Team>. Move it to this team?" */
export const rolesHeldText = (roleLabel: string, teamName: string): string =>
  `${roleLabel} is held by ${teamName}. Move it to this team?`;

export const ROLES_HELD_MOVE_LABEL = 'Move it here';
export const ROLES_HELD_KEEP_LABEL = 'Keep it there';
