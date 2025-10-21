/**
 * Frontend RBAC Types
 * Matches backend role system
 */

// Global roles
export type GlobalRole = 'admin' | 'user';

// Organization roles
export type OrganizationRole = 'org_admin' | 'moderator' | 'support' | 'associate' | 'member';

// All possible roles
export type UserRole = GlobalRole | OrganizationRole;

// Permissions object (using const with as const for type safety)
export const Permission = {
  // User Management
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
} as const;

export type Permission = typeof Permission[keyof typeof Permission];

// Permission mapping for each role
const rolePermissions: Record<UserRole, Permission[]> = {
  // Global admin has all permissions
  admin: Object.values(Permission),
  
  // Regular user (fallback)
  user: [
    Permission.VIEW_TICKETS,
    Permission.VIEW_MESSAGES,
    Permission.VIEW_STATISTICS,
  ],
  
  // Organization admin
  org_admin: [
    Permission.CREATE_USERS,
    Permission.MANAGE_USERS,
    Permission.MANAGE_ORGANIZATION,
    Permission.VIEW_ORGANIZATION_SETTINGS,
    Permission.MANAGE_INTEGRATIONS,
    Permission.VIEW_INTEGRATIONS,
    Permission.MANAGE_CATEGORIES,
    Permission.VIEW_CATEGORIES,
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
    Permission.VIEW_STATISTICS,
    Permission.VIEW_REPORTS,
  ],
  
  // Moderator
  moderator: [
    Permission.MANAGE_INTEGRATIONS,
    Permission.VIEW_INTEGRATIONS,
    Permission.MANAGE_CATEGORIES,
    Permission.VIEW_CATEGORIES,
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
    Permission.VIEW_STATISTICS,
  ],
  
  // Support
  support: [
    Permission.MANAGE_TICKETS,
    Permission.VIEW_TICKETS,
    Permission.CREATE_TICKETS,
    Permission.ASSIGN_TICKETS,
    Permission.MANAGE_MESSAGES,
    Permission.VIEW_MESSAGES,
    Permission.PROCESS_MESSAGES,
    Permission.VIEW_STATISTICS,
  ],
  
  // Associate
  associate: [
    Permission.VIEW_TICKETS,
    Permission.VIEW_MESSAGES,
    Permission.VIEW_STATISTICS,
    Permission.REQUEST_TICKET_CHANGE,
    Permission.REQUEST_MESSAGE_CHANGE,
  ],
  
  // Member (basic organization member)
  member: [
    Permission.VIEW_TICKETS,
    Permission.VIEW_MESSAGES,
    Permission.VIEW_STATISTICS,
  ],
};

/**
 * Check if a user has a specific permission
 */
export const hasPermission = (
  userRole: GlobalRole,
  orgRole: OrganizationRole | null | undefined,
  permission: Permission
): boolean => {
  // Global admin has all permissions
  if (userRole === 'admin') {
    return true;
  }
  
  // Check organization role permissions
  if (orgRole && rolePermissions[orgRole]?.includes(permission)) {
    return true;
  }
  
  // Check global user role permissions
  return rolePermissions[userRole]?.includes(permission) || false;
};

/**
 * Check if user has ANY of the specified permissions
 */
export const hasAnyPermission = (
  userRole: GlobalRole,
  orgRole: OrganizationRole | null | undefined,
  permissions: Permission[]
): boolean => {
  return permissions.some(permission => hasPermission(userRole, orgRole, permission));
};

/**
 * Check if user has ALL of the specified permissions
 */
export const hasAllPermissions = (
  userRole: GlobalRole,
  orgRole: OrganizationRole | null | undefined,
  permissions: Permission[]
): boolean => {
  return permissions.every(permission => hasPermission(userRole, orgRole, permission));
};

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
  return orgRole || 'user';
};

/**
 * Role display names
 */
export const roleDisplayNames: Record<UserRole, string> = {
  admin: 'System Administrator',
  user: 'User',
  org_admin: 'Organization Administrator',
  moderator: 'Moderator',
  support: 'Support Agent',
  associate: 'Associate',
  member: 'Member',
};

/**
 * Role descriptions
 */
export const roleDescriptions: Record<UserRole, string> = {
  admin: 'Full system access across all organizations',
  user: 'Basic user access',
  org_admin: 'Full control within organization, can manage users and settings',
  moderator: 'Can manage integrations, categories, AI settings, and handle tickets/messages',
  support: 'Can manage tickets and messages, view statistics',
  associate: 'View-only access with ability to request changes',
  member: 'Basic organization member with read access',
};

/**
 * Check if user is org admin or higher
 */
export const isOrgAdminOrHigher = (
  userRole: GlobalRole,
  orgRole: OrganizationRole | null | undefined
): boolean => {
  return userRole === 'admin' || orgRole === 'org_admin';
};

/**
 * Check if user can manage users
 */
export const canManageUsers = (
  userRole: GlobalRole,
  orgRole: OrganizationRole | null | undefined
): boolean => {
  return hasAnyPermission(userRole, orgRole, [
    Permission.MANAGE_USERS,
    Permission.CREATE_USERS,
  ]);
};

/**
 * Check if user can access settings
 */
export const canAccessSettings = (
  userRole: GlobalRole,
  orgRole: OrganizationRole | null | undefined
): boolean => {
  return hasAnyPermission(userRole, orgRole, [
    Permission.MANAGE_INTEGRATIONS,
    Permission.MANAGE_CATEGORIES,
    Permission.MANAGE_AI_PROMPTS,
    Permission.VIEW_ORGANIZATION_SETTINGS,
  ]);
};
