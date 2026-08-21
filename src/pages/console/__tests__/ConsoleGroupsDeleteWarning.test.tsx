/**
 * Deleting an alliance group deletes the IdP wire feeding it — `alliance_group_idp_map.group_id`
 * is ON DELETE CASCADE. On taco (2026-08-20) five groups were wired and later deleted; nothing
 * said the wire went too, the synced groups fell back to an older legacy display, and the
 * mapping work looked like it had never happened.
 *
 * The BE now records `group_unwired` (support-service#408). This is the other half: say it
 * BEFORE the click. The control matters as much as the warning — an unmapped group must not
 * acquire a scary sentence about provisioning it never had.
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
    expect(text).toMatch(/stop arriving/);
  });

  it('falls back to the external id when the IdP sent no display name', () => {
    const text = deleteDescription(
      group({ idpGroup: { mappingId: 4, externalId: '6a8408715f64f700012b62b8', displayName: null } })
    );
    expect(text).toContain('6a8408715f64f700012b62b8');
  });

  it('CONTROL: an unmapped group keeps the plain warning, with no provisioning claim', () => {
    const text = deleteDescription(group());
    expect(text).not.toMatch(/identity provider|stop arriving/);
    expect(text).toContain('Members lose the roles this group granted');
  });

  it('always keeps the role-loss warning, mapped or not', () => {
    const mapped = deleteDescription(
      group({ idpGroup: { mappingId: 4, externalId: 'x', displayName: 'Group A' } })
    );
    expect(mapped).toContain('Members lose the roles this group granted');
    expect(mapped).toContain('cannot be undone');
  });
});
