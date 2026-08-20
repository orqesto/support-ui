/**
 * Frontend RBAC Types
 * Matches backend role system
 */

// Global roles
export type GlobalRole = 'admin' | 'user';

// Organization roles
export type OrganizationRole = 'org_admin' | 'moderator' | 'support' | 'associate';
export const ORGANIZATION_ROLES = ['org_admin', 'moderator', 'support', 'associate'] as const satisfies readonly OrganizationRole[];

// Alliance roles (multi-org identity, Phase 4/5). A SEPARATE authorization axis from
// Global/Organization roles — deliberately NOT added to UserRole or rolePermissions.
// Mirrors the BE allianceRoleEnum. Used only for FE console nav/route gating (UX); the
// backend re-validates alliance authority on every call from DB-verified memberships.
export type AllianceRole = 'alliance_admin' | 'alliance_agent';
export const ALLIANCE_ROLES = ['alliance_admin', 'alliance_agent'] as const satisfies readonly AllianceRole[];

// All possible roles
export type UserRole = GlobalRole | OrganizationRole;

// Permissions object (using const with as const for type safety)
export const Permission = {
  // User Management
  VIEW_USERS: 'view_users',
  MANAGE_USERS: 'manage_users',
  CREATE_USERS: 'create_users',
  DELETE_USERS: 'delete_users',

  // Organization Management
  MANAGE_ORGANIZATION: 'manage_organization',
  VIEW_ORGANIZATION_SETTINGS: 'view_organization_settings',

  // Integration Management
  MANAGE_INTEGRATIONS: 'manage_integrations',
  VIEW_INTEGRATIONS: 'view_integrations',

  // Category Management
  MANAGE_CATEGORIES: 'manage_categories',
  VIEW_CATEGORIES: 'view_categories',

  // AI & Automation
  MANAGE_AI_PROMPTS: 'manage_ai_prompts',
  MANAGE_SPAM_RULES: 'manage_spam_rules',
  VIEW_AI_SETTINGS: 'view_ai_settings',

  // Ticket Management
  MANAGE_TICKETS: 'manage_tickets',
  VIEW_TICKETS: 'view_tickets',
  CREATE_TICKETS: 'create_tickets',
  DELETE_TICKETS: 'delete_tickets',
  ASSIGN_TICKETS: 'assign_tickets',
  REQUEST_TICKET_CHANGE: 'request_ticket_change',

  // Message Management
  MANAGE_MESSAGES: 'manage_messages',
  VIEW_MESSAGES: 'view_messages',
  DELETE_MESSAGES: 'delete_messages',
  PROCESS_MESSAGES: 'process_messages',
  REQUEST_MESSAGE_CHANGE: 'request_message_change',

  // Statistics & Reports
  VIEW_STATISTICS: 'view_statistics',
  VIEW_REPORTS: 'view_reports',

  // Label Management
  MANAGE_LABELS: 'manage_labels',
  VIEW_LABELS: 'view_labels',

  // Audit Logs
  VIEW_AUDIT_LOGS: 'view_audit_logs',

  // Subscription & Billing
  VIEW_SUBSCRIPTION: 'view_subscription',
  MANAGE_SUBSCRIPTION: 'manage_subscription',
  VIEW_USAGE_STATS: 'view_usage_stats',
  MANAGE_AI_MODULES: 'manage_ai_modules',
  VIEW_BILLING: 'view_billing',
  MANAGE_BILLING: 'manage_billing',

  // Message sources, and the department-assignment lever. These four exist server-side
  // but were never declared here, so no role could be shown as holding them.
  ASSIGN_USERS_TO_SOURCES: 'assign_users_to_sources',
  MANAGE_MEMBER_DEPARTMENTS: 'manage_member_departments',
  MANAGE_MESSAGE_SOURCES: 'manage_message_sources',
  VIEW_MESSAGE_SOURCES: 'view_message_sources',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

// Permission mapping for each role
export const rolePermissions: Record<UserRole, Permission[]> = {
  // Global admin has all permissions
  admin: Object.values(Permission),

  // Regular user (fallback)
  user: [Permission.VIEW_TICKETS, Permission.VIEW_MESSAGES, Permission.VIEW_STATISTICS],

  // Organization admin
  org_admin: [
    Permission.VIEW_USERS,
    Permission.CREATE_USERS,
    Permission.MANAGE_USERS,
    Permission.DELETE_USERS,
    Permission.MANAGE_MEMBER_DEPARTMENTS,
    Permission.MANAGE_ORGANIZATION,
    Permission.VIEW_ORGANIZATION_SETTINGS,
    Permission.MANAGE_INTEGRATIONS,
    Permission.VIEW_INTEGRATIONS,
    Permission.MANAGE_CATEGORIES,
    Permission.VIEW_CATEGORIES,
    Permission.MANAGE_LABELS,
    Permission.VIEW_LABELS,
    Permission.MANAGE_AI_PROMPTS,
    Permission.MANAGE_SPAM_RULES,
    Permission.VIEW_AI_SETTINGS,
    Permission.MANAGE_TICKETS,
    Permission.VIEW_TICKETS,
    Permission.CREATE_TICKETS,
    Permission.DELETE_TICKETS,
    Permission.ASSIGN_TICKETS,
    Permission.MANAGE_MESSAGES,
    Permission.VIEW_MESSAGES,
    Permission.DELETE_MESSAGES,
    Permission.PROCESS_MESSAGES,
    Permission.MANAGE_MESSAGE_SOURCES,
    Permission.VIEW_MESSAGE_SOURCES,
    Permission.ASSIGN_USERS_TO_SOURCES,
    Permission.VIEW_STATISTICS,
    Permission.VIEW_REPORTS,
    Permission.VIEW_AUDIT_LOGS,
    Permission.VIEW_SUBSCRIPTION,
    Permission.MANAGE_SUBSCRIPTION,
    Permission.VIEW_USAGE_STATS,
    Permission.MANAGE_AI_MODULES,
    Permission.VIEW_BILLING,
    Permission.MANAGE_BILLING,
  ],

  // Moderator
  moderator: [
    Permission.VIEW_USERS,
    Permission.MANAGE_MEMBER_DEPARTMENTS,
    Permission.VIEW_ORGANIZATION_SETTINGS,
    Permission.MANAGE_INTEGRATIONS,
    Permission.VIEW_INTEGRATIONS,
    Permission.MANAGE_CATEGORIES,
    Permission.VIEW_CATEGORIES,
    Permission.MANAGE_LABELS,
    Permission.VIEW_LABELS,
    Permission.MANAGE_AI_PROMPTS,
    Permission.MANAGE_SPAM_RULES,
    Permission.VIEW_AI_SETTINGS,
    Permission.MANAGE_TICKETS,
    Permission.VIEW_TICKETS,
    Permission.CREATE_TICKETS,
    Permission.ASSIGN_TICKETS,
    Permission.MANAGE_MESSAGES,
    Permission.VIEW_MESSAGES,
    Permission.PROCESS_MESSAGES,
    Permission.MANAGE_MESSAGE_SOURCES,
    Permission.VIEW_MESSAGE_SOURCES,
    Permission.ASSIGN_USERS_TO_SOURCES,
    Permission.VIEW_STATISTICS,
    Permission.VIEW_AUDIT_LOGS,
    Permission.VIEW_SUBSCRIPTION,
    Permission.VIEW_USAGE_STATS,
  ],

  // Support
  support: [
    Permission.VIEW_USERS,
    Permission.MANAGE_TICKETS,
    Permission.VIEW_TICKETS,
    Permission.CREATE_TICKETS,
    Permission.ASSIGN_TICKETS,
    Permission.MANAGE_MESSAGES,
    Permission.VIEW_MESSAGES,
    Permission.PROCESS_MESSAGES,
    Permission.VIEW_MESSAGE_SOURCES,
    Permission.VIEW_LABELS,
    Permission.VIEW_STATISTICS,
    Permission.VIEW_SUBSCRIPTION,
    Permission.VIEW_USAGE_STATS,
  ],

  // Associate
  associate: [
    Permission.VIEW_TICKETS,
    Permission.VIEW_MESSAGES,
    Permission.VIEW_MESSAGE_SOURCES,
    Permission.VIEW_STATISTICS,
    Permission.REQUEST_TICKET_CHANGE,
    Permission.REQUEST_MESSAGE_CHANGE,
  ],
};

/**
 * The table actually used to compute permissions.
 *
 * Starts as the baked-in `rolePermissions` above and is replaced once the server's own
 * table arrives (`GET /api/roles/permission-matrix`, applied by `useRolePermissionMatrix`).
 *
 * 🔑 This exists because the baked-in copy is a SECOND copy. On 2026-08-20 it was short
 * six permissions across all four org roles — `view_message_sources`, `view_usage_stats`,
 * `view_audit_logs`, `manage_message_sources`, `assign_users_to_sources`,
 * `manage_member_departments` — and since navigation is gated on `hasPermission`, an
 * org_admin was shown no Audit Logs and no Usage Stats entry while the API served both
 * perfectly well. The algorithm had never drifted; only the data had. So the algorithm
 * stays here and the data comes from the server.
 *
 * The local copy remains as the first-paint value (and the offline fallback), which is why
 * it is still kept correct rather than emptied — a wrong fallback would flash the wrong
 * navigation before the matrix lands.
 */
let activeRolePermissions: Record<UserRole, Permission[]> = rolePermissions;

/**
 * Adopt the server's role table. Ignores anything malformed rather than throwing: a bad
 * payload must degrade to the baked-in defaults, never blank the UI.
 */
export const applyServerRolePermissions = (
  matrix: Partial<Record<UserRole, string[]>> | null | undefined
): void => {
  if (!matrix || typeof matrix !== 'object') return;
  const next = { ...rolePermissions };
  let applied = false;
  for (const [role, perms] of Object.entries(matrix)) {
    if (!Array.isArray(perms)) continue;
    if (!(role in rolePermissions)) continue; // a role this build does not know about
    next[role as UserRole] = perms.filter(
      (perm): perm is Permission => typeof perm === 'string'
    );
    applied = true;
  }
  if (applied) activeRolePermissions = next;
};

/** Test seam — drop back to the baked-in table between cases. */
export const resetRolePermissionsForTests = (): void => {
  activeRolePermissions = rolePermissions;
};

/**
 * Wave 5 B (Model A) — per-user permission overrides on top of role defaults.
 * Stored on user_organizations.permission_overrides and sent to the FE via the
 * user payload. Mirrors the BE PermissionOverrides type so the same effective
 * set is computed on both sides.
 */
export type PermissionOverrides = {
  added?: string[];
  removed?: string[];
};

/**
 * Structural equality on two override sets, order-independent — so a UI that
 * serializes in a different order does not look like an edit. Mirrors the BE
 * `overridesEqual`, and is defensive against malformed shapes for the same reason.
 */
export const overridesEqual = (
  left: PermissionOverrides | null | undefined,
  right: PermissionOverrides | null | undefined
): boolean => {
  const normalize = (val: PermissionOverrides | null | undefined) => ({
    added: Array.isArray(val?.added) ? [...val.added].sort() : [],
    removed: Array.isArray(val?.removed) ? [...val.removed].sort() : [],
  });
  const one = normalize(left);
  const two = normalize(right);
  return (
    one.added.length === two.added.length &&
    one.removed.length === two.removed.length &&
    one.added.every((perm, index) => perm === two.added[index]) &&
    one.removed.every((perm, index) => perm === two.removed[index])
  );
};

/**
 * Compute the effective permission set (role defaults + added − removed).
 * Mirrors the BE computeEffectivePermissions: global admin and org_admin are
 * unconditionally bypassed (prevents self-lockout); malformed JSONB shapes
 * are defensively treated as empty.
 */
export const computeEffectivePermissions = (
  userRole: GlobalRole,
  orgRole: OrganizationRole | null | undefined,
  overrides?: PermissionOverrides | null
): Set<Permission> => {
  if (userRole === 'admin' || orgRole === 'org_admin') {
    return new Set(activeRolePermissions[userRole === 'admin' ? 'admin' : 'org_admin']);
  }
  const base = new Set<Permission>();
  if (orgRole) for (const perm of activeRolePermissions[orgRole] ?? []) base.add(perm);
  for (const perm of activeRolePermissions[userRole] ?? []) base.add(perm);
  if (!overrides) return base;
  const addedList = Array.isArray(overrides.added) ? overrides.added : [];
  const removedList = Array.isArray(overrides.removed) ? overrides.removed : [];
  const removed = new Set(removedList);
  const result = new Set<Permission>();
  for (const perm of base) {
    if (!removed.has(perm)) result.add(perm);
  }
  for (const perm of addedList) {
    result.add(perm as Permission); // `added` overrides `removed`
  }
  return result;
};

/**
 * Check if a user has a specific permission. Optional `overrides` enables
 * per-user grants beyond the role defaults; existing call sites without
 * overrides see no behavior change.
 */
export const hasPermission = (
  userRole: GlobalRole,
  orgRole: OrganizationRole | null | undefined,
  permission: Permission,
  overrides?: PermissionOverrides | null
): boolean => computeEffectivePermissions(userRole, orgRole, overrides).has(permission);

/**
 * Check if user has ANY of the specified permissions
 */
export const hasAnyPermission = (
  userRole: GlobalRole,
  orgRole: OrganizationRole | null | undefined,
  permissions: Permission[],
  overrides?: PermissionOverrides | null
): boolean => permissions.some((permission) => hasPermission(userRole, orgRole, permission, overrides));

/**
 * Check if user has ALL of the specified permissions
 */
export const hasAllPermissions = (
  userRole: GlobalRole,
  orgRole: OrganizationRole | null | undefined,
  permissions: Permission[],
  overrides?: PermissionOverrides | null
): boolean => permissions.every((permission) => hasPermission(userRole, orgRole, permission, overrides));

/**
 * Get user's effective role for display
 */
export const getEffectiveRole = (
  globalRole: GlobalRole,
  orgRole: OrganizationRole | null | undefined
): UserRole => {
  if (globalRole === 'admin') {
    return 'admin';
  }
  return orgRole ?? 'user';
};

/**
 * Role display names
 */
export const roleDisplayNames: Record<UserRole, string> = {
  admin: 'System Administrator',
  user: 'User',
  org_admin: 'Workspace Administrator',
  moderator: 'Moderator',
  support: 'Support Agent',
  associate: 'Associate',
};

/**
 * Role descriptions
 */
export const roleDescriptions: Record<UserRole, string> = {
  admin: 'Full system access across all workspaces',
  user: 'Basic user access',
  org_admin: 'Full control within workspace, can manage users and settings',
  moderator: 'Can manage integrations, categories, AI settings, and handle tickets/messages',
  support: 'Can manage tickets and messages, view statistics',
  associate: 'View-only access with ability to request changes',
};

/**
 * Check if user is org admin or higher
 */
export const isOrgAdminOrHigher = (
  userRole: GlobalRole,
  orgRole: OrganizationRole | null | undefined
): boolean => userRole === 'admin' || orgRole === 'org_admin';

/**
 * Check if user can manage users
 */
export const canManageUsers = (
  userRole: GlobalRole,
  orgRole: OrganizationRole | null | undefined,
  overrides?: PermissionOverrides | null
): boolean =>
  hasAnyPermission(
    userRole,
    orgRole,
    [Permission.MANAGE_USERS, Permission.CREATE_USERS],
    overrides
  );

/**
 * Check if user can access settings
 */
export const canAccessSettings = (
  userRole: GlobalRole,
  orgRole: OrganizationRole | null | undefined,
  overrides?: PermissionOverrides | null
): boolean =>
  hasAnyPermission(
    userRole,
    orgRole,
    [
      Permission.MANAGE_INTEGRATIONS,
      Permission.MANAGE_CATEGORIES,
      Permission.MANAGE_AI_PROMPTS,
      Permission.VIEW_ORGANIZATION_SETTINGS,
    ],
    overrides
  );
