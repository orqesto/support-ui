import { Suspense, useEffect, useMemo } from 'react';
import { NavLink, Outlet, useParams } from 'react-router-dom';
import { ArrowLeft, Network } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { usePermissions } from '@/hooks/usePermissions';
import { useScopeStore } from '@/stores/scopeStore';
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
  const numericId = allianceId ? Number(allianceId) : null;
  const setScope = useScopeStore((state) => state.setScope);
  const clearScope = useScopeStore((state) => state.clearScope);
  const { isAdmin } = usePermissions();

  useEffect(() => {
    setScope({ scope: 'alliance', allianceId: numericId });
    return () => clearScope();
  }, [numericId, setScope, clearScope]);

  const sections = useMemo(() => {
    const ctx: ConsoleScopeCtx = { scope: 'alliance', isGlobalAdmin: isAdmin, allianceId: numericId };
    return CONSOLE_SECTIONS.filter((section) => (section.visible ? section.visible(ctx) : true));
  }, [isAdmin, numericId]);

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
