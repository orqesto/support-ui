import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Building2, Settings, ShieldAlert, Users } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { organizationService } from '@/services/organization.service';
import { useAuthStore } from '@/stores/authStore';
import { useScopeStore } from '@/stores/scopeStore';
import { logger } from '@/lib/logger';

/**
 * Per-workspace management shell for a global admin (B2). Its OWN chrome (sidebar +
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
  const clearScope = useScopeStore((state) => state.clearScope);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);

  useEffect(() => {
    if (numericId === null) {
      return;
    }
    // Point the active org context at the target workspace and ensure NO admin
    // scope is set, so the api-client attaches X-Organization-Context to the
    // embedded pages' org-scoped calls. No teardown: leaving the selected org as-is
    // is harmless (it's the admin's working context).
    setSelectedOrganization(numericId);
    clearScope();
  }, [numericId, setSelectedOrganization, clearScope]);

  // Header label — resilient: a failed/absent fetch just falls back to a generic title.
  useEffect(() => {
    if (numericId === null) {
      return;
    }
    let cancelled = false;
    organizationService
      .getById(numericId)
      .then((organization) => {
        if (!cancelled) {
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
          <Suspense fallback={<Spinner size={20} />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
};
