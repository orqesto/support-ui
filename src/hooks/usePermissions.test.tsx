import type { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { WorkspaceScopeProvider } from '@/contexts/WorkspaceScopeContext';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@/types';
import { usePermissions } from './usePermissions';

/**
 * F3: inside a per-workspace management shell the embedded pages act on `:orgId`,
 * so permissions must be evaluated against the caller's role in THAT workspace
 * (org_admin, via D-04) — not their frozen home-org role. WorkspaceShell supplies
 * that scope; usePermissions must honor it, and must be unchanged without it.
 */

// An alliance_admin: global role `user`, home-org role below org_admin — the exact
// case that previously rendered a false "no permission" in the embedded pages.
const allianceAdminUser = {
  id: 1,
  email: 'aa@acme.test',
  firstName: 'Al',
  lastName: 'Admin',
  role: 'user',
  organizationRole: 'associate',
  allianceMemberships: [{ allianceId: 3, role: 'alliance_admin' }],
} as unknown as User;

const supportUser = {
  id: 2,
  email: 'support@acme.test',
  firstName: 'Sam',
  role: 'user',
  organizationRole: 'support',
} as unknown as User;

const globalAdminUser = {
  id: 3,
  email: 'admin@sys.test',
  firstName: 'Root',
  role: 'admin',
  organizationRole: 'associate',
} as unknown as User;

const withScope = ({ children }: { children: ReactNode }) => (
  <WorkspaceScopeProvider orgRole="org_admin">{children}</WorkspaceScopeProvider>
);

beforeEach(() => {
  useAuthStore.setState({ user: null, token: null, isAuthenticated: false });
});

describe('usePermissions — workspace scope (F3)', () => {
  it('alliance_admin has NO management perms from their home-org role (no scope)', () => {
    useAuthStore.setState({ user: allianceAdminUser });
    const { result } = renderHook(() => usePermissions());
    expect(result.current.isAllianceAdmin).toBe(true);
    expect(result.current.canManageUsers).toBe(false);
    expect(result.current.canManageOrganization).toBe(false);
    expect(result.current.isOrgAdmin).toBe(false);
  });

  it('alliance_admin GAINS org_admin management perms inside the workspace scope', () => {
    useAuthStore.setState({ user: allianceAdminUser });
    const { result } = renderHook(() => usePermissions(), { wrapper: withScope });
    expect(result.current.canManageUsers).toBe(true);
    expect(result.current.canManageOrganization).toBe(true);
    expect(result.current.isOrgAdmin).toBe(true);
    // Still not a global admin — the scope grants org_admin, never admin.
    expect(result.current.isAdmin).toBe(false);
  });

  it('a plain support user is NOT elevated outside the workspace scope (regression guard)', () => {
    useAuthStore.setState({ user: supportUser });
    const { result } = renderHook(() => usePermissions());
    expect(result.current.canManageUsers).toBe(false);
    expect(result.current.canManageOrganization).toBe(false);
  });

  it('a global admin keeps full permissions with or without the scope (no downgrade)', () => {
    useAuthStore.setState({ user: globalAdminUser });
    const { result: noScope } = renderHook(() => usePermissions());
    expect(noScope.current.isAdmin).toBe(true);
    expect(noScope.current.canManageUsers).toBe(true);

    const { result: scoped } = renderHook(() => usePermissions(), { wrapper: withScope });
    expect(scoped.current.isAdmin).toBe(true);
    expect(scoped.current.canManageUsers).toBe(true);
    expect(scoped.current.canManageOrganization).toBe(true);
  });
});
