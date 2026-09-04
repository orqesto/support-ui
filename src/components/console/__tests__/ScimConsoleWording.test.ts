/**
 * The words the SCIM console uses for three things the customer's devops misread on
 * 2026-09-04 — a backing group ("mapped to itself"), a refused request (no row at all), and
 * an IdP-fed group on the Groups list. Each is a pure helper so the sentence is pinned here.
 */
import { describe, it, expect } from 'vitest';
import { describeGrant } from '@/components/console/SyncedGroupsCard';
import { idpFeedLabel, splitGroups } from '@/pages/console/ConsoleGroups';
import type { AllianceGroup } from '@/services/alliance-groups.service';
import { eventReason } from '@/components/console/ScimEventLedgerCard';
import type { AllianceScimEvent } from '@/services/alliance-scim.service';

const orgs = [
  { id: 3, name: 'Orbelli' },
  { id: 4, name: 'CoreSarms' },
];

describe('describeGrant — what a backing group grants, in words', () => {
  it('names the role and the workspace, not the IdP group', () => {
    expect(
      describeGrant({ name: 'SSO - Odly - Coresarms - Associate — Associate', orgRole: 'associate', orgIds: [4] }, orgs)
    ).toBe('Associate in CoreSarms');
  });
  it('lists every workspace and survives an unknown id', () => {
    expect(describeGrant({ name: 'x', orgRole: 'moderator', orgIds: [3, 4, 99] }, orgs)).toBe(
      'Moderator in Orbelli, CoreSarms, workspace #99'
    );
  });
  it('is null for a group with neither role nor workspace, so the caller keeps the name', () => {
    expect(describeGrant({ name: 'Support EU' }, orgs)).toBeNull();
  });
});

describe('idpFeedLabel — the Groups list says which IdP group feeds a backing group', () => {
  it('names the IdP group and says it is the mapping, not the group', () => {
    expect(
      idpFeedLabel({ idpGroup: { mappingId: 1, externalId: 'abc', displayName: 'SSO - Odly - Orbelli - Admin' } })
    ).toBe('Backing group for IdP group SSO - Odly - Orbelli - Admin — the mapping, not the IdP group itself');
  });
  it('falls back to the external id and is null for a hand-authored group', () => {
    expect(idpFeedLabel({ idpGroup: { mappingId: 1, externalId: 'abc', displayName: null } })).toContain('abc');
    expect(idpFeedLabel({ idpGroup: null })).toBeNull();
    expect(idpFeedLabel({})).toBeNull();
  });
});

describe('eventReason — a refused request says WHAT was refused', () => {
  const base: AllianceScimEvent = {
    id: 1,
    eventType: 'request_rejected',
    severity: 'warning',
    actorType: 'idp',
    actorTokenId: 9,
    actorUserId: null,
    targetUserId: 15,
    targetEmail: null,
    idpGroupExternalId: null,
    beforeRole: null,
    afterRole: null,
    outcome: 'rejected',
    detail: { method: 'PATCH', path: '/api/scim/v2/Users/15', scimStatus: 404, reason: 'User 15 not found in this alliance.' },
    createdAt: '2026-09-04T06:26:59.000Z',
  };
  it('renders method, path, status and the reason on one line', () => {
    expect(eventReason(base)).toBe('PATCH /api/scim/v2/Users/15 → 404: User 15 not found in this alliance.');
  });
  it('still renders a plain reason for every other event type', () => {
    expect(eventReason({ ...base, eventType: 'provision_rejected', detail: { reason: 'nope' } })).toBe('nope');
    expect(eventReason({ ...base, eventType: 'resync', detail: {} })).toBeNull();
  });
});

describe('splitGroups — the Groups page lists what the admin authored, and the mappings apart', () => {
  const group = (id: number, idpGroup: AllianceGroup['idpGroup']): AllianceGroup =>
    ({ id, name: `g${id}`, description: null, orgRole: 'associate', orgIds: [3], memberIds: [], memberCount: 0, idpGroup }) as unknown as AllianceGroup;
  it('puts an IdP-fed group under backing and a hand-made one under authored', () => {
    const { authored, backing } = splitGroups([
      group(1, null),
      group(2, { mappingId: 9, externalId: 'x', displayName: 'SSO - Odly - Orbelli - Admin' }),
      group(3, undefined),
    ]);
    expect(authored.map((item) => item.id)).toEqual([1, 3]);
    expect(backing.map((item) => item.id)).toEqual([2]);
  });
});
