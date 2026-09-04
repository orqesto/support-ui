/**
 * One predicate for "can this user switch workspaces", shared by the switcher (which
 * performs the switch) and the banner (which exists because a switch is possible). The
 * two used to disagree — banner: global admin only; switcher: admin OR two memberships —
 * so a multi-workspace org_admin could switch and write with no banner. Audit u39 P0-1.
 */
import { describe, expect, it } from 'vitest';
import { canSwitchWorkspace } from '../canSwitchWorkspace';

const orgs = (count: number) => Array.from({ length: count }, (_, index) => ({ id: index + 1 }));

describe('canSwitchWorkspace', () => {
  it.each([
    ['a global admin with no memberships listed', { role: 'admin' }, 0, true],
    ['a global admin with one membership', { role: 'admin' }, 1, true],
    ['a member of two workspaces', { role: 'user' }, 2, true],
    ['an org_admin of three workspaces', { role: 'user' }, 3, true],
    ['a member of one workspace', { role: 'user' }, 1, false],
    ['a member with no memberships yet', { role: 'user' }, 0, false],
    ['a signed-out session', null, 2, true],
    ['a signed-out session with nothing to switch to', null, 0, false],
    ['a user record with no role', {}, 1, false],
  ])('%s', (_label, user, membershipCount, expected) => {
    expect(canSwitchWorkspace(user, orgs(membershipCount))).toBe(expected);
  });
});
