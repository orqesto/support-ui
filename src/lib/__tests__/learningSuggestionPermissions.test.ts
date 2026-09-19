/**
 * The UI copy of the server's domain→permission map.
 *
 * The bug this closes: a moderator holds `manage_routing_rules`, so the engine was proposing
 * changes to rules they maintain — on a screen that returned `null` for them. Hiding was chosen
 * because every action 403'd; now the server gates per domain, so the panel is shown and the
 * individual actions carry the reason.
 *
 * ⛔ The SERVER is the authority. This copy only decides what the UI enables, and drift degrades
 * to "the button was enabled and the server's 403 explains why" — never to an action going
 * through that the server would have refused.
 */
import { describe, expect, it } from 'vitest';
import {
  SUGGESTION_DOMAIN_PERMISSIONS,
  permissionForSuggestionDomain,
  whyCannotAct,
} from '../learningSuggestionPermissions';
import { Permission, rolePermissions } from '@/types/roles';

describe('learning suggestion permissions (UI copy)', () => {
  it('maps each domain to the permission for what it writes', () => {
    expect(permissionForSuggestionDomain('routing')).toBe(Permission.MANAGE_ROUTING_RULES);
    expect(permissionForSuggestionDomain('spam')).toBe(Permission.MANAGE_SPAM_RULES);
    expect(permissionForSuggestionDomain('detection')).toBe(Permission.MANAGE_SPAM_RULES);
    expect(permissionForSuggestionDomain('categorization')).toBe(Permission.MANAGE_CATEGORIES);
    expect(permissionForSuggestionDomain('reply_style')).toBe(Permission.MANAGE_AI_PROMPTS);
    expect(permissionForSuggestionDomain('auto_reply')).toBe(Permission.MANAGE_AI_PROMPTS);
    // A person's KB capture: the permission the per-entry approve/reject buttons need.
    expect(permissionForSuggestionDomain('kb_review')).toBe(Permission.MANAGE_KNOWLEDGE_BASE);
  });

  it('an unmapped or unknown domain is ADMIN-ONLY, not allowed', () => {
    expect(permissionForSuggestionDomain('kb_quality')).toBeNull();
    expect(permissionForSuggestionDomain('contradiction')).toBeNull();
    expect(permissionForSuggestionDomain('a_domain_invented_tomorrow')).toBeNull();
  });

  it('every mapped permission is one a MODERATOR already holds — the UI widens nothing', () => {
    for (const permission of Object.values(SUGGESTION_DOMAIN_PERMISSIONS)) {
      expect(rolePermissions.moderator).toContain(permission);
    }
  });

  it('CONTROL — moderators do NOT hold a permission outside this set', () => {
    expect(rolePermissions.moderator).not.toContain(Permission.MANAGE_AI_MODULES);
  });

  it('says WHY an action is unavailable, differently for admin-only and missing permission', () => {
    expect(whyCannotAct('kb_quality')).toMatch(/admin/i);
    expect(whyCannotAct('routing')).toMatch(/permission/i);
    expect(whyCannotAct('kb_quality')).not.toBe(whyCannotAct('routing'));
  });
});
