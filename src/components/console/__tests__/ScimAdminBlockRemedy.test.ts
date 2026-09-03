/**
 * When may the console offer to demote a platform admin?
 *
 * The refusal message already names the remedy, and for 17 days it named it to somebody who
 * had to go and find the account by hand — 39 rejected pushes later, nothing had changed. The
 * button closes that loop, so what triggers it has to be exact: it demotes a platform
 * administrator, and the wrong match would offer that on an unrelated rejection.
 */
import { describe, it, expect } from 'vitest';
import { platformAdminBlock } from '@/components/console/ScimEventLedgerCard';
import type { AllianceScimEvent } from '@/services/alliance-scim.service';

const event = (over: Partial<AllianceScimEvent> = {}): AllianceScimEvent =>
  ({
    id: 1,
    eventType: 'provision_rejected',
    severity: 'warning',
    actorType: 'idp',
    actorTokenId: null,
    actorUserId: null,
    targetUserId: 4,
    targetEmail: 'smith@taconet.info',
    idpGroupExternalId: null,
    beforeRole: null,
    afterRole: null,
    outcome: 'rejected',
    detail: { reason: 'smith@taconet.info is a platform administrator in Odly, and SCIM never…' },
    createdAt: '2026-09-03T05:56:46.352Z',
    ...over,
  }) as AllianceScimEvent;

describe('the platform-admin remedy', () => {
  it('offers the remedy on the refusal a role change actually resolves', () => {
    expect(platformAdminBlock(event())).toEqual({
      userId: 4,
      email: 'smith@taconet.info',
    });
  });

  /**
   * ⛔ `provision_rejected` covers EVERY refusal — uniqueness, seat cap. Demoting an admin
   * fixes none of those, and offering it there would be an invitation to break something for
   * no reason. The match is on the reason, not the event type.
   */
  it('stays away from rejections a role change does not fix', () => {
    expect(
      platformAdminBlock(
        event({ detail: { reason: 'A user with this userName/email already exists.' } })
      )
    ).toBeNull();
    expect(
      platformAdminBlock(event({ detail: { reason: 'Organization has reached its user limit.' } }))
    ).toBeNull();
  });

  it('ignores every other event type, even one carrying that reason', () => {
    expect(platformAdminBlock(event({ eventType: 'user_provisioned' }))).toBeNull();
    expect(platformAdminBlock(event({ eventType: 'group_member_skipped' }))).toBeNull();
  });

  /**
   * Rejection rows recorded before support-service#642 carry `targetUserId: null` — every row
   * on taco older than today does. A remedy cannot name an account it does not have, so those
   * rows get no button rather than a broken one.
   */
  it('offers nothing when the row cannot name the account', () => {
    expect(platformAdminBlock(event({ targetUserId: null }))).toBeNull();
    expect(platformAdminBlock(event({ targetUserId: 0 }))).toBeNull();
  });

  it('survives a row with no detail at all', () => {
    expect(platformAdminBlock(event({ detail: null }))).toBeNull();
    expect(platformAdminBlock(event({ detail: { reason: 42 } as never }))).toBeNull();
  });
});
