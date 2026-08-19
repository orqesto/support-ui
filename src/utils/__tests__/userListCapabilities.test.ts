import { describe, expect, it } from 'vitest';
import {
  getUserRowCapabilities,
  type CapabilityActor,
  type CapabilityTarget,
} from '../userListCapabilities';

// Actor archetypes (already-resolved authority primitives, as a page would pass them).
const globalAdmin: CapabilityActor = {
  userId: 1,
  isGlobalAdmin: true,
  canManageUsers: true,
  canDeleteUsers: true,
};
const orgAdmin: CapabilityActor = {
  userId: 2,
  isGlobalAdmin: false,
  canManageUsers: true,
  canDeleteUsers: true,
};
// org_admin with DELETE_USERS removed via a permission override.
const orgAdminNoDelete: CapabilityActor = {
  userId: 3,
  isGlobalAdmin: false,
  canManageUsers: true,
  canDeleteUsers: false,
};
// moderator/support: sees the list (VIEW_USERS) but cannot manage.
const moderator: CapabilityActor = {
  userId: 4,
  isGlobalAdmin: false,
  canManageUsers: false,
  canDeleteUsers: false,
};

const normalTarget: CapabilityTarget = { userId: 50, globalRole: 'user' };
const globalAdminTarget: CapabilityTarget = { userId: 60, globalRole: 'admin' };

describe('getUserRowCapabilities — workspace scope', () => {
  it('lets a user edit but not remove their own row', () => {
    const caps = getUserRowCapabilities('workspace', orgAdmin, {
      userId: orgAdmin.userId!,
      globalRole: 'user',
    });
    expect(caps.isSelf).toBe(true);
    expect(caps.canEdit).toBe(true);
    expect(caps.canRemove).toBe(false);
  });

  it('lets a global admin manage and remove anyone — including a global-admin target', () => {
    const onNormal = getUserRowCapabilities('workspace', globalAdmin, normalTarget);
    expect(onNormal.canEdit).toBe(true);
    expect(onNormal.canRemove).toBe(true);
    const onAdmin = getUserRowCapabilities('workspace', globalAdmin, globalAdminTarget);
    expect(onAdmin.canEdit).toBe(true);
    expect(onAdmin.canRemove).toBe(true);
  });

  it('lets an org admin manage and remove a normal workspace user', () => {
    const caps = getUserRowCapabilities('workspace', orgAdmin, normalTarget);
    expect(caps.canEdit).toBe(true);
    expect(caps.canRemove).toBe(true);
  });

  it('forbids removing an IdP-managed member (removal is the IdP’s job; deactivate instead)', () => {
    const managedTarget: CapabilityTarget = { userId: 70, globalRole: 'user', scimManaged: true };
    const caps = getUserRowCapabilities('workspace', orgAdmin, managedTarget);
    expect(caps.canRemove).toBe(false); // managed → not hard-removable
    expect(caps.canEdit).toBe(true); // still openable (role/dept are locked in the modal)
  });

  it('forbids an org admin from managing or removing a GLOBAL admin', () => {
    const caps = getUserRowCapabilities('workspace', orgAdmin, globalAdminTarget);
    expect(caps.canEdit).toBe(false);
    expect(caps.canRemove).toBe(false);
  });

  it('forbids remove (but still allows edit gating) when the actor lacks DELETE_USERS', () => {
    const caps = getUserRowCapabilities('workspace', orgAdminNoDelete, normalTarget);
    expect(caps.canEdit).toBe(true); // manage != delete
    expect(caps.canRemove).toBe(false); // no DELETE_USERS
  });

  it('forbids a moderator (no manage-users authority) from editing or removing others', () => {
    const caps = getUserRowCapabilities('workspace', moderator, normalTarget);
    expect(caps.canEdit).toBe(false);
    expect(caps.canRemove).toBe(false);
  });

  it('pins the §5 remove semantics by ACTOR tier: org admin removes membership; global admin deletes the account', () => {
    // org admin (non-global) → membership-only, matching the BE removeUserFromOrganization path.
    const orgAdminCaps = getUserRowCapabilities('workspace', orgAdmin, normalTarget);
    expect(orgAdminCaps.removeKind).toBe('membership');
    expect(orgAdminCaps.canChangeGlobalRole).toBe(false);

    // global admin acting through the workspace UI → full account delete (BE keys on the
    // actor's role, not the surface), so the UI must label it as an account deletion.
    const globalAdminCaps = getUserRowCapabilities('workspace', globalAdmin, normalTarget);
    expect(globalAdminCaps.removeKind).toBe('account');
  });
});

describe('getUserRowCapabilities — platform scope', () => {
  it('lets a global admin change another user’s global role', () => {
    const caps = getUserRowCapabilities('platform', globalAdmin, normalTarget);
    expect(caps.canChangeGlobalRole).toBe(true);
  });

  it('enforces self-lockout: a global admin cannot change their OWN global role', () => {
    const caps = getUserRowCapabilities('platform', globalAdmin, {
      userId: globalAdmin.userId!,
      globalRole: 'admin',
    });
    expect(caps.isSelf).toBe(true);
    expect(caps.canChangeGlobalRole).toBe(false);
  });

  it('lets a global admin edit any profile and delete any account (full global management)', () => {
    const caps = getUserRowCapabilities('platform', globalAdmin, normalTarget);
    expect(caps.canEdit).toBe(true);
    expect(caps.canRemove).toBe(true);
  });

  it('enforces self-lockout on delete: a global admin cannot delete their OWN account', () => {
    const caps = getUserRowCapabilities('platform', globalAdmin, {
      userId: globalAdmin.userId!,
      globalRole: 'admin',
    });
    expect(caps.canEdit).toBe(true); // editing your own profile is fine
    expect(caps.canRemove).toBe(false); // but not deleting your own account
  });

  it('pins the §5 semantics: a platform remove deletes the global account', () => {
    const caps = getUserRowCapabilities('platform', globalAdmin, normalTarget);
    expect(caps.removeKind).toBe('account');
  });
});
