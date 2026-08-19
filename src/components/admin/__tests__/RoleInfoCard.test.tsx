import { describe, expect, it } from 'vitest';
import { PERMISSION_CATALOG } from '../RoleInfoCard';
import { ORGANIZATION_ROLES, Permission, rolePermissions } from '@/types/roles';

const catalogPermissions = PERMISSION_CATALOG.flatMap((group) =>
  group.permissions.map((entry) => entry.permission)
);

describe('RoleInfoCard PERMISSION_CATALOG', () => {
  it('covers every permission in the source of truth (no permission silently hidden)', () => {
    const allPermissions = Object.values(Permission).sort();
    expect([...catalogPermissions].sort()).toEqual(allPermissions);
  });

  it('lists each permission exactly once (no duplicate rows)', () => {
    expect(new Set(catalogPermissions).size).toBe(catalogPermissions.length);
  });

  it('every role in rolePermissions only grants permissions that exist in the catalog', () => {
    // Guards the inverse: a role can't grant a permission the guide has no label for.
    for (const role of ORGANIZATION_ROLES) {
      for (const permission of rolePermissions[role]) {
        expect(catalogPermissions).toContain(permission);
      }
    }
  });
});
