/**
 * User-management capability model — the ONE source of truth for "who can do what
 * to whom" across the two user-list surfaces (workspace + platform).
 *
 * Background: there is one `users` directory. `user_organizations` and
 * `alliance_memberships` are GRANT/edge tables, not separate user lists. The UI shows
 * the same directory through different scoped lenses; this module centralizes the
 * capability logic that used to be duplicated per page (`UsersPage.canManageUser` /
 * `canDeleteUser`, `PlatformUsers` self-lockout).
 *
 * Capability = (actor's authority) ∩ (scope), per USER-MGMT-CONSOLE-MODEL §4.
 *
 * IMPORTANT — the §5 remove/delete split (`removeKind`): "Remove" means two different
 * things and conflating them can nuke a cross-workspace / SSO identity. Verified against
 * the backend (`userController.deleteUser`): the split keys on the ACTOR's tier, not the
 * surface —
 *   - org admin (non-global) → removes the *membership* only (`user_organizations` row);
 *     the global account survives (critical for multi-workspace / IdP-managed users).
 *   - global admin → deletes the *account* (global, across ALL workspaces). This is true
 *     even when acting through a per-workspace UI, so a global admin's "remove" there is a
 *     full account delete — label it accordingly.
 * `removeKind` EXPRESSES that so callers can label the action correctly; it does not by
 * itself change which endpoint a page calls.
 */

import type { GlobalRole } from '@/types/roles';

export type UsersScope = 'workspace' | 'platform';

/** What a scope's "Remove" action means for the underlying identity. */
export type RemoveKind = 'account' | 'membership';

/**
 * Already-resolved authority primitives for the acting user. Callers pass the SAME
 * values they already trust from `usePermissions()` so this stays behavior-preserving
 * and does not re-derive (or drift from) the page's own permission evaluation.
 */
export interface CapabilityActor {
  /** The acting user's id (`user.id`); `undefined` before the profile is restored. */
  userId: number | undefined;
  /** `user.role === 'admin'` — the one global bypass tier. */
  isGlobalAdmin: boolean;
  /** MANAGE_USERS || CREATE_USERS in the current scope (usePermissions.canManageUsers). */
  canManageUsers: boolean;
  /** DELETE_USERS in the current scope (usePermissions.hasPermission(DELETE_USERS)). */
  canDeleteUsers: boolean;
}

/** The row being acted on. */
export interface CapabilityTarget {
  userId: number;
  /** The target's GLOBAL role (`users.role`), used to protect global admins. */
  globalRole: GlobalRole;
  /**
   * IdP-managed member (SCIM / alliance-provisioned) in this workspace. Such a member
   * must NOT be hard-removed from Odly — removal is the IdP's job (the BE 409s on it);
   * they are deactivated via the alliance console or in the IdP instead.
   */
  scimManaged?: boolean;
}

export interface RowCapabilities {
  /** The actor is acting on their own row. */
  isSelf: boolean;
  /** May edit this user's profile / scoped role. */
  canEdit: boolean;
  /** May remove this user in this scope (see `removeKind` for what that destroys). */
  canRemove: boolean;
  /** What "Remove" destroys in this scope — for correct labelling (§5). */
  removeKind: RemoveKind;
  /** May change this user's GLOBAL role (`users.role`) — platform scope only. */
  canChangeGlobalRole: boolean;
}

const workspaceCapabilities = (
  actor: CapabilityActor,
  target: CapabilityTarget,
  isSelf: boolean
): RowCapabilities => {
  const targetIsGlobalAdmin = target.globalRole === 'admin';

  // Mirrors UsersPage.canManageUser: self → yes; global admin → yes; a plain org admin
  // may not manage a GLOBAL admin; otherwise gated on manage-users authority.
  let canEdit: boolean;
  if (isSelf) {
    canEdit = true;
  } else if (actor.isGlobalAdmin) {
    canEdit = true;
  } else if (targetIsGlobalAdmin) {
    canEdit = false;
  } else {
    canEdit = actor.canManageUsers;
  }

  // Mirrors UsersPage.canDeleteUser: never self; requires DELETE_USERS; global admin →
  // yes; a plain org admin may not delete a GLOBAL admin; otherwise gated on manage.
  let canRemove: boolean;
  if (isSelf) {
    canRemove = false;
  } else if (!actor.canDeleteUsers) {
    canRemove = false;
  } else if (actor.isGlobalAdmin) {
    canRemove = true;
  } else if (targetIsGlobalAdmin) {
    canRemove = false;
  } else {
    canRemove = actor.canManageUsers;
  }

  // IdP-managed members must not be hard-removed here — removal is the IdP's job and the
  // BE 409s on it. Deactivate them via the alliance console (or in the IdP) instead.
  if (target.scimManaged) {
    canRemove = false;
  }

  // What "Remove" destroys mirrors the BE (userController.deleteUser): the decision keys
  // on the ACTOR's tier, not the surface — a global admin deletes the whole account across
  // all workspaces, while an org admin removes only this workspace's membership.
  const removeKind: RemoveKind = actor.isGlobalAdmin ? 'account' : 'membership';

  return { isSelf, canEdit, canRemove, removeKind, canChangeGlobalRole: false };
};

const platformCapabilities = (actor: CapabilityActor, isSelf: boolean): RowCapabilities => ({
  isSelf,
  // Platform (global-admin) surface = full GLOBAL user management. A global admin may edit
  // any user's global profile (name/position via PUT /api/users/:id, which skips the
  // org-context guard for admins) and delete any account but their own (self-lockout;
  // system-org guard is BE-enforced). Per-workspace attributes (role in a workspace,
  // departments, skills) are edited by drilling into that workspace, not here.
  canEdit: actor.isGlobalAdmin,
  canRemove: actor.isGlobalAdmin && !isSelf,
  removeKind: 'account',
  // Global role is editable by a global admin, never on your own row (self-lockout;
  // the BE returns 403). The platform surface is global-admin-gated by its route.
  canChangeGlobalRole: actor.isGlobalAdmin && !isSelf,
});

/**
 * Resolve what the acting user may do to a target row within a given scope.
 * Pure — safe to call per row during render.
 */
export const getUserRowCapabilities = (
  scope: UsersScope,
  actor: CapabilityActor,
  target: CapabilityTarget
): RowCapabilities => {
  const isSelf = actor.userId !== undefined && actor.userId === target.userId;
  return scope === 'platform'
    ? platformCapabilities(actor, isSelf)
    : workspaceCapabilities(actor, target, isSelf);
};
