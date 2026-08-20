/**
 * The role table, and where it comes from.
 *
 * Background: this app kept its own copy of the backend's role → permission table and
 * gated navigation on it. The copy fell behind by six permissions across all four org
 * roles, so an org_admin was shown no Audit Logs and no Usage Stats entry while the API
 * served both — a client-side false negative that looked like a permissions bug.
 *
 * Two things are pinned here: the baked-in fallback is correct as of the sync, and the
 * server's table wins once it arrives — including the case that matters, a permission the
 * backend grants that this build has never heard of.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  Permission,
  rolePermissions,
  applyServerRolePermissions,
  resetRolePermissionsForTests,
  computeEffectivePermissions,
  hasPermission,
} from '@/types/roles';

afterEach(resetRolePermissionsForTests);

describe('baked-in role table', () => {
  it('grants org_admin the six permissions it had lost', () => {
    // Each of these was granted server-side and absent here. VIEW_AUDIT_LOGS and
    // VIEW_USAGE_STATS are the two that hid working nav entries.
    for (const perm of [
      Permission.VIEW_MESSAGE_SOURCES,
      Permission.VIEW_USAGE_STATS,
      Permission.VIEW_AUDIT_LOGS,
      Permission.MANAGE_MESSAGE_SOURCES,
      Permission.ASSIGN_USERS_TO_SOURCES,
      Permission.MANAGE_MEMBER_DEPARTMENTS,
    ]) {
      expect(rolePermissions.org_admin).toContain(perm);
    }
  });

  it('lets an associate see message sources', () => {
    // The Associate role card rendered "View integrations ✗" while the backend allowed it.
    expect(hasPermission('user', 'associate', Permission.VIEW_MESSAGE_SOURCES)).toBe(true);
  });

  it('keeps the plain `user` fallback minimal', () => {
    // Guard against a bulk re-sync accidentally widening the least-privileged role — the
    // one direction of this fix that would be an escalation rather than a restoration.
    expect(new Set(rolePermissions.user)).toEqual(
      new Set([Permission.VIEW_TICKETS, Permission.VIEW_MESSAGES, Permission.VIEW_STATISTICS])
    );
  });
});

describe('applyServerRolePermissions', () => {
  it('adopts a permission the server grants that this build never listed', () => {
    // The whole point: the backend can add a permission to a role and this app follows
    // without a release. `support` does not hold MANAGE_BILLING in any shipped table.
    expect(hasPermission('user', 'support', Permission.MANAGE_BILLING)).toBe(false);

    applyServerRolePermissions({ support: [Permission.MANAGE_BILLING] });

    expect(hasPermission('user', 'support', Permission.MANAGE_BILLING)).toBe(true);
  });

  it('still applies per-user overrides on top of the server table', () => {
    applyServerRolePermissions({ support: [Permission.VIEW_TICKETS] });

    const effective = computeEffectivePermissions('user', 'support', {
      added: [Permission.VIEW_BILLING],
      removed: [Permission.VIEW_TICKETS],
    });

    expect(effective.has(Permission.VIEW_BILLING)).toBe(true);
    expect(effective.has(Permission.VIEW_TICKETS)).toBe(false);
  });

  it('ignores a malformed payload rather than blanking the UI', () => {
    // A bad response must degrade to the baked-in table. Emptying it would strip the
    // navigation from every user at once, which is far worse than being slightly stale.
    const malformed: unknown[] = [null, undefined, 'nope', { support: 'not-an-array' }, {}];
    for (const bad of malformed) {
      applyServerRolePermissions(bad as Parameters<typeof applyServerRolePermissions>[0]);
      expect(hasPermission('user', 'org_admin', Permission.VIEW_AUDIT_LOGS)).toBe(true);
    }
  });

  it('ignores roles this build does not know about', () => {
    applyServerRolePermissions({
      auditor: [Permission.VIEW_AUDIT_LOGS],
    } as Parameters<typeof applyServerRolePermissions>[0]);

    expect(hasPermission('user', 'associate', Permission.VIEW_AUDIT_LOGS)).toBe(false);
  });
});
