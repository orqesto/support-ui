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
import { accessSummary } from '@/pages/console/ConsoleMembers';
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
