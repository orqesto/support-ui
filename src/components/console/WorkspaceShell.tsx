import { Suspense, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Boxes, Building2, Settings, ShieldAlert, Users } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { WorkspaceScopeProvider } from '@/contexts/WorkspaceScopeContext';
import { usePermissions } from '@/hooks/usePermissions';
import { organizationService } from '@/services/organization.service';
import { useAuthStore } from '@/stores/authStore';
import { useScopeStore } from '@/stores/scopeStore';
import { logger } from '@/lib/logger';

/**
 * Per-workspace management shell for a global admin OR an alliance_admin managing one of
 * their alliance's member workspaces (B2). An alliance_admin is materialized as `org_admin`
 * of every member workspace (roleMapping D-04 via the fan-out reconciler), so the embedded
 * org-scoped calls below are authorized for them by the BE org-context. Its OWN chrome (sidebar +
 * top bar + <Outlet/>) — deliberately NOT the org-scoped Layout — mounted at the
 * TOP-LEVEL route `/console/workspace/:orgId/*` (a sibling of `/console/platform`,
 * never a child of it). That placement is load-bearing:
 *
 *  - The platform AdminShell forces scope='platform', which DROPS the
 *    `X-Organization-Context` header (D-ADM-1). Every org-scoped call the embedded
 *    UsersPage/OrganizationPage make (invite, skills, permission overrides, config)
 *    would then hit the wrong/no org. So this shell must live OUTSIDE that shell.
 *  - On mount it points the active org context at `:orgId` via
 *    `setSelectedOrganization` AND clears any admin scope (`clearScope`) so the
 *    api-client interceptor takes its default branch and attaches
 *    `X-Organization-Context: <orgId>` to those embedded calls.
 */
export const WorkspaceShell = () => {
  const { orgId } = useParams();
  // Where "back" returns to — the console the admin came from. Passed as ?from=… by the
  // Manage action (platform Workspaces vs an alliance's Workspaces). Falls back to the
  // platform console. Only same-origin console paths are honored (never an external URL).
  const [searchParams] = useSearchParams();
  const fromParam = searchParams.get('from');
  const backTo = fromParam?.startsWith('/console/') ? fromParam : '/console/platform/organizations';
  const backLabel = backTo.startsWith('/console/alliance/')
    ? 'Alliance console'
    : 'Platform console';
  // A non-numeric param (Number(...) === NaN) is invalid — never point the org
  // context at NaN. Treat non-finite as null and render an explicit error state.
  const parsedId = orgId ? Number(orgId) : NaN;
  const numericId = Number.isFinite(parsedId) ? parsedId : null;
  const setSelectedOrganization = useAuthStore((state) => state.setSelectedOrganization);
  const selectedOrganizationId = useAuthStore((state) => state.selectedOrganizationId);
  const clearScope = useScopeStore((state) => state.clearScope);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  // The departments budget lever is global-admin only (its BE endpoints are
  // requireGlobalAdmin) — hide the tab for an alliance_admin, who reaches this shell
  // as org_admin and would only get 403s.
  const { isAdmin } = usePermissions();

  // Latest render's view of "which org is selected" and "which org this shell shows",
  // readable from the unmount cleanup below without re-running it on every change.
  const contextRef = useRef({ selected: selectedOrganizationId, viewing: numericId });
  contextRef.current = { selected: selectedOrganizationId, viewing: numericId };

  // Repointing `selectedOrganizationId` at `:orgId` (next effect) is a BORROW of the admin's
  // working context, not a move. It used to be left where this shell put it ("no teardown …
  // harmless"), and `partialize` persists it — so "Back to app" walked the whole app,
  // every list, every write, into the workspace the admin had merely been LOOKING at, and
  // a reload kept it there. Restore what was selected before this shell mounted.
  //
  // Declared BEFORE the repoint effect so it captures the pre-repoint value. The restore is
  // conditional on the context still being ours: a logout (null) or a switch made while
  // this shell was open must not be undone by our unmount.
  useEffect(() => {
    const restoreTo = contextRef.current.selected;
    return () => {
      const { selected, viewing } = contextRef.current;
      if (restoreTo !== null && restoreTo !== viewing && selected === viewing) {
        setSelectedOrganization(restoreTo);
      }
    };
  }, [setSelectedOrganization]);

  useEffect(() => {
    if (numericId === null) {
      return;
    }
    // Point the active org context at the target workspace and ensure NO admin
    // scope is set, so the api-client attaches X-Organization-Context to the
    // embedded pages' org-scoped calls. The teardown lives in the effect above.
    setSelectedOrganization(numericId);
    clearScope();
  }, [numericId, setSelectedOrganization, clearScope]);

  // Header label — resilient: a failed/absent fetch just falls back to a generic title.
  // Use `getCurrent` (org-context resolved, gated by VIEW_MESSAGES) rather than
  // `getById` (global-admin only → 403 for an alliance_admin, who would then always
  // see the generic "Manage workspace" title). The org context was pointed at
  // `:orgId` by the effect above, so `current` IS this workspace; guard on the
  // returned id in case that context hasn't settled, to never show a wrong name.
  useEffect(() => {
    if (numericId === null) {
      return;
    }
    let cancelled = false;
    organizationService
      .getCurrent()
      .then((organization) => {
        if (!cancelled && organization.id === numericId) {
          setWorkspaceName(organization.name);
        }
      })
      .catch((error) => {
        logger.error('Failed to load workspace name', error);
      });
    return () => {
      cancelled = true;
    };
  }, [numericId]);

  if (numericId === null) {
    return (
      <div className="flex justify-center items-center p-6 min-h-screen bg-background">
        <Alert variant="danger" className="max-w-md">
          <div className="space-y-3">
            <div>
              <p className="font-medium text-foreground">Invalid workspace</p>
              <p className="text-sm text-muted-foreground">This workspace link is invalid.</p>
            </div>
            <NavLink to={backTo}>
              <Button variant="secondary">
                <ShieldAlert className="mr-2 w-4 h-4" />
                Back to {backLabel}
              </Button>
            </NavLink>
          </div>
        </Alert>
      </div>
    );
  }

  const basePath = `/console/workspace/${orgId}`;
  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex gap-3 items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
      isActive
        ? 'bg-primary/10 text-primary'
        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
    }`;

  return (
    <div className="flex overflow-hidden h-screen bg-background">
      <aside className="flex overflow-hidden flex-col w-64 border-r border-border bg-card">
        <div className="flex flex-shrink-0 gap-2 items-center px-4 h-16 border-b border-border">
          <Building2 className="w-5 h-5 text-primary" />
          <span className="font-semibold text-foreground">Manage workspace</span>
        </div>
        <nav className="overflow-y-auto flex-1 p-3 space-y-1">
          {/* Leave-this-shell links pinned at the TOP so getting out is always the
              first affordance — back UP to the platform console, or all the way out
              to the app. */}
          <div className="pb-2 mb-2 space-y-1 border-b border-border">
            <NavLink
              to="/dashboard"
              className="flex gap-2 items-center px-3 py-2 text-sm rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to app</span>
            </NavLink>
            <NavLink
              to={backTo}
              className="flex gap-2 items-center px-3 py-2 text-sm rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ArrowLeft className="w-4 h-4" />
              <ShieldAlert className="w-4 h-4" />
              <span>{backLabel}</span>
            </NavLink>
          </div>
          <NavLink to={basePath} end className={navLinkClass}>
            <Users className="flex-shrink-0 w-4 h-4" />
            <span className="truncate">Users</span>
          </NavLink>
          <NavLink to={`${basePath}/settings`} className={navLinkClass}>
            <Settings className="flex-shrink-0 w-4 h-4" />
            <span className="truncate">Workspace</span>
          </NavLink>
          {isAdmin && (
            <NavLink to={`${basePath}/departments`} className={navLinkClass}>
              <Boxes className="flex-shrink-0 w-4 h-4" />
              <span className="truncate">Departments</span>
            </NavLink>
          )}
        </nav>
      </aside>

      <div className="flex flex-col flex-1 min-w-0">
        <header className="flex gap-3 items-center px-6 h-16 border-b border-border bg-card">
          <span className="font-semibold truncate text-foreground">
            {workspaceName ?? 'Manage workspace'}
          </span>
          <Badge variant="secondary">Workspace</Badge>
        </header>
        <main className="overflow-y-auto flex-1 p-6">
          {/* F3: the embedded pages act on `:orgId`, not the caller's home org. Scope
              their permission checks to `org_admin` — the role an alliance_admin holds in
              every member workspace (D-04). Entry is already gated to global-admin OR
              alliance_admin, and the BE org-context re-authorizes each call, so this only
              corrects the FE affordance (was a false "no permission" for alliance_admins
              whose home-org role is below org_admin). Global admins are unaffected — their
              global role already grants full permissions regardless of org role. */}
          <WorkspaceScopeProvider orgRole="org_admin">
            <Suspense fallback={<Spinner size={20} />}>
              <Outlet />
            </Suspense>
          </WorkspaceScopeProvider>
        </main>
      </div>
    </div>
  );
};
