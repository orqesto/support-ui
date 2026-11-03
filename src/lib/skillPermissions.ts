import { Permission } from '@/types/roles';

/**
 * May set other members' routing skills: user managers, and moderators — who hold
 * manage_routing_rules and tune routing (owner 2026-11-03; the backend accepts either).
 */
export const canManageMemberSkills = (perms: {
  canManageUsers: boolean;
  hasPermission: (permission: Permission) => boolean;
}): boolean => perms.canManageUsers || perms.hasPermission(Permission.MANAGE_ROUTING_RULES);
