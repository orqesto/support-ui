/**
 * Reply templates P1 (build spec A1): MANAGE_REPLY_TEMPLATES is a default of BOTH org_admin and
 * moderator, as on the backend — missing from either list, the page hides "New template" from
 * people the server allows. Support and associate do not get it by default.
 */
import { describe, expect, it } from 'vitest';
import { Permission, rolePermissions } from '@/types/roles';

describe('MANAGE_REPLY_TEMPLATES defaults', () => {
  it('org_admin and moderator have it; support and associate do not', () => {
    expect(rolePermissions.org_admin).toContain(Permission.MANAGE_REPLY_TEMPLATES);
    expect(rolePermissions.moderator).toContain(Permission.MANAGE_REPLY_TEMPLATES);
    expect(rolePermissions.support).not.toContain(Permission.MANAGE_REPLY_TEMPLATES);
    expect(rolePermissions.associate).not.toContain(Permission.MANAGE_REPLY_TEMPLATES);
  });
});
