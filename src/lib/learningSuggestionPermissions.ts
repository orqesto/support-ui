/**
 * Which permission a learning suggestion needs, per domain.
 *
 * Mirrors the server's `src/modules/learning/suggestionPermissions.ts`, which is the authority:
 * the server gates every action on the suggestion's own domain, so a moderator who may edit a
 * routing rule by hand may also accept the engine's proposal to edit one.
 *
 * ⛔ This copy exists only to decide what the UI ENABLES. If the two ever drift, the server still
 * refuses and its 403 names the domain — so drift degrades to "the button was enabled and the
 * error explains why", never to an action the server would have refused silently going through.
 *
 * ⛔ An unmapped domain is ADMIN-ONLY here too, for the same reason: a domain added later must
 * not become moderator-actionable just because the UI had not heard of it.
 */
import { Permission } from '@/types/roles';

export const SUGGESTION_DOMAIN_PERMISSIONS: Readonly<Record<string, Permission>> = {
  routing: Permission.MANAGE_ROUTING_RULES,
  spam: Permission.MANAGE_SPAM_RULES,
  detection: Permission.MANAGE_SPAM_RULES,
  categorization: Permission.MANAGE_CATEGORIES,
  reply_style: Permission.MANAGE_AI_PROMPTS,
  auto_reply: Permission.MANAGE_AI_PROMPTS,
  // A person's "Resolve & Save to KB" capture waiting for review — the same permission the
  // per-entry approve/reject buttons need.
  kb_review: Permission.MANAGE_KNOWLEDGE_BASE,
};

/** The permission needed to act on this domain, or null when only an org admin may. */
export const permissionForSuggestionDomain = (domain: string): Permission | null =>
  SUGGESTION_DOMAIN_PERMISSIONS[domain] ?? null;

/**
 * KB consolidation (#873): permission by suggestion TYPE, not domain. `kb_quality` STAYS
 * admin-only — the engine also emits routing-rule `promote` suggestions under it, and opening
 * the whole domain to KB moderators would let them promote routing rules. Only the two KB
 * content types map to manage_knowledge_base (mirrors BE `suggestionPermissions.ts`).
 */
export const KB_CONSOLIDATION_SUGGESTION_TYPES: ReadonlySet<string> = new Set([
  'consolidate',
  'attach',
]);

export const SUGGESTION_TYPE_PERMISSIONS: Readonly<Record<string, Readonly<Record<string, Permission>>>> =
  {
    kb_quality: {
      consolidate: Permission.MANAGE_KNOWLEDGE_BASE,
      attach: Permission.MANAGE_KNOWLEDGE_BASE,
    },
  };

export const isKbConsolidationSuggestion = (suggestion: {
  domain: string;
  suggestionType: string;
}): boolean =>
  suggestion.domain === 'kb_quality' &&
  KB_CONSOLIDATION_SUGGESTION_TYPES.has(suggestion.suggestionType);

/** The permission needed to act on this suggestion: its TYPE mapping first, then its domain. */
export const permissionForSuggestion = (suggestion: {
  domain: string;
  suggestionType: string;
}): Permission | null =>
  SUGGESTION_TYPE_PERMISSIONS[suggestion.domain]?.[suggestion.suggestionType] ??
  permissionForSuggestionDomain(suggestion.domain);

/** Human-readable reason for a disabled action, for a tooltip or inline note. */
export const whyCannotAct = (domain: string): string =>
  permissionForSuggestionDomain(domain) === null
    ? 'Only an organisation admin can act on this suggestion.'
    : 'You do not have permission to change this kind of rule. Ask an admin.';
