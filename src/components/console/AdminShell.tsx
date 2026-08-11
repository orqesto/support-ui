import { Suspense, useEffect, useMemo } from 'react';
import { NavLink, Outlet, useParams } from 'react-router-dom';
import { ArrowLeft, Network, ShieldAlert } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { usePermissions } from '@/hooks/usePermissions';
import { useMyAlliances } from '@/hooks/useAllianceAdmin';
import { useScopeStore, type AdminScope } from '@/stores/scopeStore';
import { ConsoleLoading } from './ConsoleLoading';
import { CONSOLE_SECTIONS, PLATFORM_SECTIONS, type ConsoleScopeCtx } from './consoleSections';
import { AllianceSwitcher } from './AllianceSwitcher';

type AdminShellProps = { scope?: AdminScope };

/**
 * Org-agnostic admin shell — its OWN chrome (sidebar + top bar + <Outlet/>),
 * deliberately NOT the org-scoped Layout. Analog: admin.atlassian.com above a Jira
 * site. Drives two consoles off one component:
 *  - scope 'alliance' (default): `/console/alliance/:allianceId/*`, gated on
 *    alliance-admin membership; top bar shows the AllianceSwitcher.
 *  - scope 'platform': `/console/platform/*`, gated on global admin; a static scope
 *    chip instead of a switcher.
 * On mount it writes the scope into the (non-persisted) scopeStore so the api-client
 * attaches the right context header (D-ADM-1); it clears the scope on unmount.
 */
export const AdminShell = ({ scope = 'alliance' }: AdminShellProps = {}) => {
  const isPlatform = scope === 'platform';
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
    setScope({ scope, allianceId: isPlatform ? null : numericId });
    return () => clearScope();
  }, [scope, isPlatform, numericId, setScope, clearScope]);

  const registry = isPlatform ? PLATFORM_SECTIONS : CONSOLE_SECTIONS;
  const sections = useMemo(() => {
    const ctx: ConsoleScopeCtx = { scope, isGlobalAdmin: isAdmin, allianceId: numericId };
    return registry.filter((section) => (section.visible ? section.visible(ctx) : true));
  }, [registry, scope, isAdmin, numericId]);

  // Access. Platform: global admin only. Alliance: a global admin may view any VALID
  // alliance; everyone else must administer THIS specific alliance. Render an explicit
  // state — never substitute one, and never mount the sections.
  const invalidId = !isPlatform && numericId === null;
  const administersThis = isPlatform
    ? isAdmin
    : !invalidId && (isAdmin || alliances.some((alliance) => alliance.id === numericId));

  // Only a non-admin viewing an alliance waits on the membership list to decide.
  if (!isPlatform && !invalidId && !isAdmin && alliancesLoading) {
    return <ConsoleLoading />;
  }
  if (!administersThis) {
    return (
      <div className="flex justify-center items-center p-6 min-h-screen bg-background">
        <Alert variant="danger" className="max-w-md">
          <div className="space-y-3">
            <div>
              <p className="font-medium text-foreground">
                {isPlatform
                  ? "You don't have platform access"
                  : "You don't administer this alliance"}
              </p>
              <p className="text-sm text-muted-foreground">
                {isPlatform
                  ? 'The platform console requires a global administrator account.'
                  : invalidId
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

  const basePath = isPlatform ? '/console/platform' : `/console/alliance/${allianceId}`;

  return (
    <div className="flex overflow-hidden h-screen bg-background">
      <aside className="flex overflow-hidden flex-col w-64 border-r border-border bg-card">
        <div className="flex flex-shrink-0 gap-2 items-center px-4 h-16 border-b border-border">
          {isPlatform ? (
            <ShieldAlert className="w-5 h-5 text-primary" />
          ) : (
            <Network className="w-5 h-5 text-primary" />
          )}
          <span className="font-semibold text-foreground">
            {isPlatform ? 'Platform Admin' : 'Alliance Admin'}
          </span>
        </div>
        <nav className="overflow-y-auto flex-1 p-3 space-y-1">
          {/* Leave-this-shell links pinned at the TOP of the console nav so getting out is
              always the first affordance. A global admin who drilled into an alliance from
              the Platform console also gets a link back UP to it (else "Back to app" is the
              only exit and they're stranded away from where they came from). */}
          <div className="pb-2 mb-2 space-y-1 border-b border-border">
            <NavLink
              to="/dashboard"
              className="flex gap-2 items-center px-3 py-2 text-sm rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to app</span>
            </NavLink>
            {!isPlatform && isAdmin && (
              <NavLink
                to="/console/platform/alliances"
                className="flex gap-2 items-center px-3 py-2 text-sm rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <ArrowLeft className="w-4 h-4" />
                <ShieldAlert className="w-4 h-4" />
                <span>Platform console</span>
              </NavLink>
            )}
          </div>
          {sections.map((section) => {
            const Icon = section.icon;
            const to = section.path ? `${basePath}/${section.path}` : basePath;
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
      </aside>

      <div className="flex flex-col flex-1 min-w-0">
        <header className="flex gap-3 items-center px-6 h-16 border-b border-border bg-card">
          {isPlatform ? <Badge variant="secondary">Platform</Badge> : <AllianceSwitcher />}
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
