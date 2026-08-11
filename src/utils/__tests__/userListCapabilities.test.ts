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

  it('pins the §5 semantics: workspace remove is membership-only, never a global-role change', () => {
    const caps = getUserRowCapabilities('workspace', orgAdmin, normalTarget);
    expect(caps.removeKind).toBe('membership');
    expect(caps.canChangeGlobalRole).toBe(false);
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

  it('exposes no profile-edit or delete on the platform directory', () => {
    const caps = getUserRowCapabilities('platform', globalAdmin, normalTarget);
    expect(caps.canEdit).toBe(false);
    expect(caps.canRemove).toBe(false);
  });

  it('pins the §5 semantics: a platform remove would delete the global account', () => {
    const caps = getUserRowCapabilities('platform', globalAdmin, normalTarget);
    expect(caps.removeKind).toBe('account');
  });
});
