import { Suspense, useEffect, useMemo } from 'react';
import { NavLink, Outlet, useParams } from 'react-router-dom';
import { ArrowLeft, Network } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { usePermissions } from '@/hooks/usePermissions';
import { useMyAlliances } from '@/hooks/useAllianceAdmin';
import { useScopeStore } from '@/stores/scopeStore';
import { ConsoleLoading } from './ConsoleLoading';
import { CONSOLE_SECTIONS, type ConsoleScopeCtx } from './consoleSections';
import { AllianceSwitcher } from './AllianceSwitcher';

/**
 * Org-agnostic Alliance admin shell — its OWN chrome (sidebar + top bar +
 * <Outlet/>), deliberately NOT the org-scoped Layout. Analog: admin.atlassian.com
 * sitting above a Jira site. On mount it derives the alliance scope from the URL
 * param into the (non-persisted) scopeStore so the api-client attaches
 * X-Alliance-Context (D-ADM-1); it clears the scope on unmount so a stale scope
 * never leaks back into the org-scoped app.
 */
export const AdminShell = () => {
  const { allianceId } = useParams();
  // A non-numeric param (Number(...) === NaN) is invalid — hooks gate on `!== null`, so
  // NaN would otherwise slip through to /api/alliances/NaN/... Treat non-finite as null.
  const parsedId = allianceId ? Number(allianceId) : NaN;
  const numericId = Number.isFinite(parsedId) ? parsedId : null;
  const setScope = useScopeStore((state) => state.setScope);
  const clearScope = useScopeStore((state) => state.clearScope);
  const { isAdmin } = usePermissions();
  const { data: alliances = [], isLoading: alliancesLoading } = useMyAlliances();

  useEffect(() => {
    setScope({ scope: 'alliance', allianceId: numericId });
    return () => clearScope();
  }, [numericId, setScope, clearScope]);

  const sections = useMemo(() => {
    const ctx: ConsoleScopeCtx = { scope: 'alliance', isGlobalAdmin: isAdmin, allianceId: numericId };
    return CONSOLE_SECTIONS.filter((section) => (section.visible ? section.visible(ctx) : true));
  }, [isAdmin, numericId]);

  // Wrong/invalid alliance: a global admin may view any *valid* alliance; everyone else
  // must administer THIS specific alliance. Render an explicit state — never substitute
  // one, and never mount the sections (which would re-derive NaN and hit /alliances/NaN).
  const invalidId = numericId === null;
  const administersThis = !invalidId && (isAdmin || alliances.some((alliance) => alliance.id === numericId));
  // A global admin needs no membership list; only a non-admin waits on it to decide.
  if (!invalidId && !isAdmin && alliancesLoading) {
    return <ConsoleLoading />;
  }
  if (!administersThis) {
    return (
      <div className="flex justify-center items-center p-6 min-h-screen bg-background">
        <Alert variant="danger" className="max-w-md">
          <div className="space-y-3">
            <div>
              <p className="font-medium text-foreground">You don&apos;t administer this alliance</p>
              <p className="text-sm text-muted-foreground">
                {invalidId
                  ? 'This alliance link is invalid.'
                  : 'Your account has no alliance-admin access to this alliance.'}
              </p>
            </div>
            <NavLink to="/dashboard">
              <Button variant="secondary">
                <ArrowLeft className="mr-2 w-4 h-4" />
                Back to app
              </Button>
            </NavLink>
          </div>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="flex flex-col w-64 border-r border-border bg-card">
        <div className="flex gap-2 items-center px-4 h-16 border-b border-border">
          <Network className="w-5 h-5 text-primary" />
          <span className="font-semibold text-foreground">Alliance Admin</span>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {sections.map((section) => {
            const Icon = section.icon;
            const to = section.path
              ? `/console/alliance/${allianceId}/${section.path}`
              : `/console/alliance/${allianceId}`;
            return (
              <NavLink
                key={section.id}
                to={to}
                end={section.index}
                className={({ isActive }) =>
                  `flex gap-3 items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`
                }
              >
                <Icon className="flex-shrink-0 w-4 h-4" />
                <span className="truncate">{section.label}</span>
              </NavLink>
            );
          })}
        </nav>
        <div className="p-3 border-t border-border">
          <NavLink
            to="/dashboard"
            className="flex gap-2 items-center px-3 py-2 text-sm rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to app</span>
          </NavLink>
        </div>
      </aside>

      <div className="flex flex-col flex-1 min-w-0">
        <header className="flex gap-3 items-center px-6 h-16 border-b border-border bg-card">
          <AllianceSwitcher />
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
