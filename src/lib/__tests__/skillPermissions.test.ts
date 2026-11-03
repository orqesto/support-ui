import { describe, expect, it } from 'vitest';
import { canManageMemberSkills } from '@/lib/skillPermissions';
import { Permission } from '@/types/roles';

const holds = (granted: Permission[]) => (permission: Permission) => granted.includes(permission);

describe('canManageMemberSkills', () => {
  it('a moderator (manage_routing_rules, no manage_users) may set members’ skills', () => {
    expect(
      canManageMemberSkills({
        canManageUsers: false,
        hasPermission: holds([Permission.MANAGE_ROUTING_RULES]),
      })
    ).toBe(true);
  });

  it('a user manager may', () => {
    expect(canManageMemberSkills({ canManageUsers: true, hasPermission: holds([]) })).toBe(true);
  });

  it('CONTROL: a support agent may not', () => {
    expect(
      canManageMemberSkills({ canManageUsers: false, hasPermission: holds([Permission.VIEW_USERS]) })
    ).toBe(false);
  });
});
