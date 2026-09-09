/**
 * A dash in the Effective-roles column used to mean two opposite things: "never had access
 * here" and "access was REVOKED". Nothing distinguished them — the backend read only active
 * workspace rows, and `orgCount` on the platform users list filtered the same way.
 *
 * That is the mechanism behind a customer reporting "I removed them in JumpCloud and nothing
 * happened": an IdP group removal revokes the workspace grant but deliberately leaves the
 * alliance membership alone, so a removal that WORKED showed the person still listed, still
 * active, with an empty roles column — identical to a removal that did nothing.
 */
import { describe, it, expect } from 'vitest';
import { accessSummary, roleDivergence } from '@/pages/console/ConsoleMembers';
import type { EffectiveRole } from '@/services/alliance-admin.service';

const role = (orgId: number, orgName: string, name = 'associate'): EffectiveRole => ({
  orgId,
  orgName,
  role: name,
});

describe('the Effective roles column', () => {
  it('shows a dash ONLY when the member never had access anywhere', () => {
    const summary = accessSummary({ effectiveRoles: [], revokedRoles: [] });

    expect(summary.neverHadAccess).toBe(true);
    expect(summary.granted).toEqual([]);
    expect(summary.revoked).toEqual([]);
  });

  it('does NOT show a dash when access was revoked — that is the whole point', () => {
    const summary = accessSummary({
      effectiveRoles: [],
      revokedRoles: [role(3, 'Orbelli', 'moderator')],
    });

    expect(summary.neverHadAccess).toBe(false);
    expect(summary.revoked).toHaveLength(1);
    expect(summary.revoked[0].orgName).toBe('Orbelli');
  });

  it('keeps granted and revoked apart when a member holds one and lost the other', () => {
    const summary = accessSummary({
      effectiveRoles: [role(4, 'CoreSarms')],
      revokedRoles: [role(3, 'Orbelli', 'moderator')],
    });

    expect(summary.granted.map((entry) => entry.orgName)).toEqual(['CoreSarms']);
    expect(summary.revoked.map((entry) => entry.orgName)).toEqual(['Orbelli']);
    expect(summary.neverHadAccess).toBe(false);
  });

  /**
   * ⛔ The field is optional on purpose: a frontend deployed ahead of the backend must render
   * exactly as it does today, never a phantom "revoked".
   */
  it('treats a backend that does not send revokedRoles as "nothing revoked"', () => {
    const summary = accessSummary({ effectiveRoles: [role(4, 'CoreSarms')] });

    expect(summary.revoked).toEqual([]);
    expect(summary.neverHadAccess).toBe(false);

    const none = accessSummary({ effectiveRoles: [] });
    expect(none.neverHadAccess).toBe(true);
  });
});

/**
 * Reported 2026-09-09: the workspace Users page showed alice, mia and stella as "Workspace
 * Administrator · IdP-managed" while their group (SSO - Odly - Orbelli - Moderator) maps to
 * Moderator. That is not a sync failure — all three were made admins by hand in July, and the
 * reconciler resolves highest-wins over (direct grant, group target), so `org_admin` beats
 * `moderator` and stays.
 *
 * The console showed the group's wiring and NOTHING about the direct grant, so there was no
 * way to tell a deliberate rule from a broken sync. These chips are that missing explanation.
 */
describe('why a membership diverges from its IdP group', () => {
  const withDirect = (role: string, directRole: string | null): EffectiveRole => ({
    orgId: 3,
    orgName: 'Orbelli',
    role,
    directRole,
  });

  it('names the direct grant for the REPORTED case, where it equals the role in force', () => {
    // alice: group maps Moderator, her July grant was org_admin, highest-wins keeps org_admin
    // — so the snapshot EQUALS the live role. An earlier version of this helper filtered to
    // `directRole !== role` and therefore showed nothing on exactly these members.
    expect(roleDivergence(withDirect('org_admin', 'org_admin')).directRole).toBe('org_admin');
  });

  it('also names it when the group RAISED the member above their direct grant', () => {
    expect(roleDivergence(withDirect('org_admin', 'moderator')).directRole).toBe('moderator');
  });

  it('says nothing for a membership the alliance itself created', () => {
    // No direct grant underneath — louise, miller, vincent in the reported screenshot.
    expect(roleDivergence(withDirect('moderator', null)).directRole).toBeNull();
  });

  it('flags customised permissions, and separates "not recorded" from "nobody"', () => {
    const base: EffectiveRole = { orgId: 3, orgName: 'Orbelli', role: 'moderator' };

    expect(roleDivergence(base).hasOverrides).toBe(false);

    // Customised before attribution existed: we know THAT it happened, not who.
    const legacy = roleDivergence({ ...base, hasOverrides: true });
    expect(legacy.hasOverrides).toBe(true);
    expect(legacy.overridesAttributed).toBe(false);

    const attributed = roleDivergence({
      ...base,
      hasOverrides: true,
      overridesSetByName: 'Mike',
      overridesSetAt: '2026-09-09T10:00:00Z',
    });
    expect(attributed.overridesAttributed).toBe(true);
  });
});
