/**
 * Deleting a WIRED alliance group is refused by the backend (409, support-service#651): the
 * mapping is one thing, retired by unwiring on the Provisioning screen. This copy used to
 * promise the opposite — "deleting it also removes that mapping" — from the days when
 * `alliance_group_idp_map.group_id` cascaded silently (taco, 2026-08-20: five groups wired,
 * deleted, and the mapping work looked like it had never happened).
 *
 * Say the refusal BEFORE the click. The control matters as much as the warning — an unmapped
 * group must not acquire a sentence about provisioning it never had.
 */
import { describe, it, expect } from 'vitest';
import { deleteDescription } from '@/pages/console/ConsoleGroups';
import type { AllianceGroup } from '@/services/alliance-groups.service';

const group = (overrides: Partial<AllianceGroup> = {}): AllianceGroup =>
  ({
    id: 1,
    name: 'Support EU',
    orgRole: 'support',
    orgIds: [],
    idpGroup: null,
    ...overrides,
  }) as AllianceGroup;

describe('the group-delete warning', () => {
  it('names the IdP group by display name', () => {
    const text = deleteDescription(
      group({ idpGroup: { mappingId: 4, externalId: '6a84087', displayName: 'SSO - Odly - Biaxol - View-new' } })
    );
    expect(text).toContain('SSO - Odly - Biaxol - View-new');
    expect(text).toMatch(/refused while it is wired/);
    expect(text).toMatch(/Provisioning screen/);
  });

  it('falls back to the external id when the IdP sent no display name', () => {
    const text = deleteDescription(
      group({ idpGroup: { mappingId: 4, externalId: '6a8408715f64f700012b62b8', displayName: null } })
    );
    expect(text).toContain('6a8408715f64f700012b62b8');
  });

  it('CONTROL: an unmapped group keeps the plain warning, with no provisioning claim', () => {
    const text = deleteDescription(group());
    expect(text).not.toMatch(/identity provider|refused/);
    expect(text).toContain('Members lose the roles this group granted');
    expect(text).toContain('cannot be undone');
  });

  // The old copy promised a cascade ("also removes that mapping … wire it again"). The
  // backend refuses the delete instead, so promising role loss or a cascade would be a lie.
  it('never promises a cascade for a wired group', () => {
    const mapped = deleteDescription(
      group({ idpGroup: { mappingId: 4, externalId: 'x', displayName: 'Group A' } })
    );
    expect(mapped).not.toMatch(/also removes that mapping|wire it again|cannot be undone/);
  });
});
