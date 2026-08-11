import { createContext, useContext, type ReactNode } from 'react';
import type { OrganizationRole } from '@/types/roles';

/**
 * The caller's EFFECTIVE org role inside a per-workspace management shell
 * (`/console/workspace/:orgId`), independent of their home-org role.
 *
 * Why (F3): `usePermissions` derives management affordances from
 * `user.organizationRole` — the caller's HOME-org role, frozen at login. But the
 * embedded UsersPage/OrganizationPage act on a DIFFERENT org (`:orgId`). An
 * alliance_admin (global role `user`) is materialized as `org_admin` of every
 * member workspace (roleMapping D-04 via the fan-out reconciler), so the BE
 * authorizes their embedded calls — yet their home-org role may be below
 * `org_admin`, which made the FE render a false "no permission" state.
 *
 * `WorkspaceShell` provides this scope so `usePermissions` evaluates against the
 * target workspace instead. It is a UX gate ONLY — the BE org-context re-validates
 * every embedded call (a caller with no `user_organizations` row for `:orgId`
 * still gets a clean 403). Absent a provider the context is null and
 * `usePermissions` behaves exactly as before (zero change outside the shell).
 */
type WorkspaceScope = {
  /** Effective org role to evaluate permissions against inside this workspace. */
  orgRole: OrganizationRole;
};

const WorkspaceScopeContext = createContext<WorkspaceScope | null>(null);

export const WorkspaceScopeProvider = ({
  orgRole,
  children,
}: {
  orgRole: OrganizationRole;
  children: ReactNode;
}) => (
  <WorkspaceScopeContext.Provider value={{ orgRole }}>{children}</WorkspaceScopeContext.Provider>
);

/** The active workspace scope, or null when not inside a WorkspaceShell. */
export const useWorkspaceScope = () => useContext(WorkspaceScopeContext);
