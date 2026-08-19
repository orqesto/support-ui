import { useState, useMemo, useEffect, useCallback, type ReactNode } from 'react';
import {
  LayoutDashboard,
  Mail,
  Ticket,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  Users,
  CreditCard,
  TrendingUp,
  BookOpen,
  Receipt,
  GitBranch,
  ShieldAlert,
  ScrollText,
  Network,
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { useEmailProcessing } from '@/hooks/useEmailProcessing';
import { usePermissions } from '@/hooks/usePermissions';
import { useMyAlliances } from '@/hooks/useAllianceAdmin';
import { useFeatures } from '@/hooks/useFeatures';
import { useUiFlags } from '@/hooks/useUiFlags';
import { useBackendVersion } from '@/hooks/useBackendVersion';
import { joinOrganizationRoom, leaveOrganizationRoom } from '@/lib/socketManager';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { useSubscriptionGateStore } from '@/stores/subscriptionGateStore';
import { apiClient } from '@/lib/api-client';
import { ALLIANCE_CONSOLE_ENABLED } from '@/lib/config';
import { Permission, roleDisplayNames } from '@/types/roles';
import { OrganizationSwitcher } from './OrganizationSwitcher';
import { DepartmentSwitcher } from './DepartmentSwitcher';
import { useNotificationCounts } from '@/hooks/useNotificationCounts';
import { useTicketsCount } from '@/hooks/useTicketsCount';
import { VersionStatus } from './VersionStatus';
import { ThemeToggle } from './ThemeToggle';
import { NotificationCenter } from './NotificationCenter';
import { useSLANotifications } from '@/hooks/useSLANotifications';
import { LicenseExpiryBanner } from './LicenseExpiryBanner';
import { ResumeSetupBanner } from './ResumeSetupBanner';
import { TrialBanner } from './TrialBanner';
import { SubscriptionGateOverlay } from '@/components/subscription/SubscriptionGateOverlay';
import { useLearningNotifications } from '@/hooks/useLearningNotifications';
import { WebSocketStatus } from '../shared/WebSocketStatus';
import { WebSocketDebug } from '../shared/WebSocketDebug';
import { MessageProcessingProgress } from '../messages/MessageProcessingProgress';
import { logger } from '@/lib/logger';

const isDevelopment = import.meta.env.DEV;

type LayoutProps = {
  children: ReactNode;
};

// Sidebar is grouped into Work / Insights / Admin sections. Groups render with a
// section header; a group whose items are all gated out hides its header too.
// "Needs Routing" lives in Work per Wave 5 C-2 spec (top-nav triage queue for all
// VIEW_MESSAGES users so admins stop being the bottleneck). "Deleted Messages" is
// a recovery tool — moved to Admin and gated to global admin (was misleadingly
// surfaced to every VIEW_MESSAGES user before).
type NavGroup = 'work' | 'insights' | 'admin' | 'consoles';

const allNavigation: Array<{
  group: NavGroup;
  name: string;
  href: string;
  icon: typeof LayoutDashboard;
  permission?: Permission;
  adminOnly?: boolean;
  featureRequired?: string;
  /**
   * A `ui.` feature-flag key. Hides the item until the surface is finished. Use this for
   * "not built yet"; use `featureRequired` for "your plan does not include it".
   */
  flagRequired?: string;
  showBadge?: boolean;
  // Hidden whenever the BE reports billing is off (deployment.billingEnabled=false):
  // self-hosted boxes AND managed boxes where a billing provider isn't configured
  // yet. Authoritative billing signal — supersedes the old selfHosted-only gate.
  hideWhenBillingOff?: boolean;
  // Alliance console entry — visible only to a global admin or an alliance_admin.
  allianceAdmin?: boolean;
  // P3: hidden from global admins, whose equivalent lives in the platform console
  // (e.g. Workspace → Platform › Organizations). Non-global users still see it.
  hideForGlobalAdmin?: boolean;
}> = [
  // ─── Work — daily inbox / triage ────────────────────────────────────────────
  { group: 'work', name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  {
    group: 'work',
    name: 'Messages',
    href: '/messages',
    icon: Mail,
    permission: Permission.VIEW_MESSAGES,
  },
  {
    group: 'work',
    name: 'Tickets',
    href: '/tickets',
    icon: Ticket,
    permission: Permission.VIEW_TICKETS,
  },
  {
    group: 'work',
    name: 'Needs Routing',
    href: '/needs-routing',
    icon: GitBranch,
    permission: Permission.VIEW_MESSAGES,
    showBadge: true,
  },
  {
    group: 'work',
    name: 'Knowledge Base',
    href: '/knowledge-base',
    icon: BookOpen,
    permission: Permission.VIEW_MESSAGES,
  },

  // ─── Insights — reporting & finance ─────────────────────────────────────────
  {
    group: 'insights',
    name: 'Statistics',
    href: '/statistics',
    icon: BarChart3,
    permission: Permission.VIEW_STATISTICS,
  },
  {
    group: 'insights',
    name: 'Usage Stats',
    href: '/usage-stats',
    icon: TrendingUp,
    permission: Permission.VIEW_USAGE_STATS,
    hideWhenBillingOff: true,
  },
  {
    group: 'insights',
    name: 'Billing Intelligence',
    href: '/billing',
    icon: Receipt,
    permission: Permission.VIEW_BILLING,
    featureRequired: 'billingIntelligence',
    flagRequired: 'ui.billing_intelligence',
    hideWhenBillingOff: true,
  },

  // ─── Consoles — scope-aware admin shells (own group; labels match the shell
  //     headers so the audience is obvious). Alliance = customer IT; Platform = Odly staff.
  { group: 'consoles', name: 'Alliance Console', href: '/console', icon: Network, allianceAdmin: true },
  { group: 'consoles', name: 'Platform Console', href: '/console/platform', icon: ShieldAlert, adminOnly: true },

  // ─── Admin — org-scoped configuration & rare-use ────────────────────────────
  // Per-workspace user management (invite/create/edit/delete, skills, permission
  // overrides). Global admins KEEP this — the platform console's Users section is only a
  // cross-org directory + global-role editor and can't do these org-scoped actions (the
  // console drops the org context header). Global admins pick the target workspace via the
  // OrganizationSwitcher.
  {
    group: 'admin',
    name: 'Users',
    href: '/users',
    icon: Users,
    permission: Permission.VIEW_USERS,
  },
  // Workspace details moved into Settings › Workspace › Details (the standalone
  // '/organization' nav tab was retired; that route now redirects there). Keeps
  // "Workspace" a single concept under Settings instead of a duplicate top-level tab.
  {
    group: 'admin',
    name: 'Settings',
    href: '/settings',
    icon: Settings,
    permission: Permission.VIEW_ORGANIZATION_SETTINGS,
  },
  {
    group: 'admin',
    name: 'Subscription',
    href: '/subscription',
    icon: CreditCard,
    permission: Permission.VIEW_SUBSCRIPTION,
    hideWhenBillingOff: true,
  },
  // Global admin views audit via the platform console (Platform › Audit); hide the
  // org-scoped audit page from the main nav to avoid the duplicate entry point.
  {
    group: 'admin',
    name: 'Audit Logs',
    href: '/audit-logs',
    icon: ScrollText,
    permission: Permission.VIEW_AUDIT_LOGS,
    hideForGlobalAdmin: true,
  },
  // P3: 'Admin Dashboard' (/admin) removed — its Plans + Usage tabs now live in
  // the platform console (Billing & Plans / Usage). The /admin route still
  // redirects global admins there as a one-release fallback.
  // Deleted Messages + Orphaned Outbound moved into Settings › System (sub-tabs) so
  // system ops live in one place instead of loose main-nav entries.
];

// 'admin' is the internal group key; the user-facing label is 'Administration'. Most
// items here (Users, Settings, Subscription, Audit Logs) are visible to
// org_admins/moderators with the matching permission — not just global admins — so the
// header stays role-neutral rather than implying admin-only content. The strictly
// admin-only recovery tools (Deleted Messages, Orphaned Outbound) still appear here for
// global admins. A full role-aware split into separate moderator/admin groups remains a
// future task — see [PLAN] Role-aware nav grouping.
const NAV_GROUP_LABELS: Record<NavGroup, string> = {
  work: 'Work',
  insights: 'Insights',
  admin: 'Administration',
  consoles: 'Consoles',
};
const NAV_GROUP_ORDER: NavGroup[] = ['work', 'insights', 'admin', 'consoles'];

/**
 * Routes that are reachable but don't have a top-nav entry. Used so the mobile
 * breadcrumb shows the right title instead of falling back to "Dashboard".
 */
const DEEP_ROUTE_TITLES: Record<string, string> = {
  '/pricing': 'Pricing',
  '/tickets/create': 'Create Ticket',
  '/sla': 'SLA',
};

const getPageTitle = (pathname: string, navItems: typeof allNavigation): string => {
  // Exact deep-route override (most specific wins).
  if (DEEP_ROUTE_TITLES[pathname]) return DEEP_ROUTE_TITLES[pathname];
  // Sort nav items by href length descending so `/tickets/edit/:id` matches
  // a longer `/tickets/edit` entry before the broader `/tickets`.
  const sorted = [...navItems].sort((left, right) => right.href.length - left.href.length);
  const match = sorted.find(
    (item) => pathname === item.href || pathname.startsWith(item.href + '/')
  );
  return match?.name ?? 'Dashboard';
};

export const Layout = ({ children }: LayoutProps) => {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const selectedOrganizationId = useAuthStore((state) => state.selectedOrganizationId);
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Onboarding gate (shell-level so it covers every protected route, not just the
  // dashboard — closes the deep-link bypass). Redirect an org_admin whose org
  // never finished the wizard into it. Excludes GLOBAL admins: their
  // `organizationRole` reflects their home/system org, not the client org they're
  // viewing via the switcher, so gating them would pull them into (and consume the
  // one-shot trial of) every fresh client org. Skips while status is 'unknown'
  // (loading) or the org is subscription-gated (the overlay owns the screen). The
  // wizard lives outside Layout, so this never loops.
  const onboardingStatus = useOnboardingStore((state) => state.status);
  const fetchOnboardingOnce = useOnboardingStore((state) => state.fetchOnce);
  const subscriptionGated = useSubscriptionGateStore((state) => state.gated);
  useEffect(() => {
    fetchOnboardingOnce(selectedOrganizationId);
  }, [fetchOnboardingOnce, selectedOrganizationId]);
  useEffect(() => {
    if (
      user?.role !== 'admin' &&
      user?.organizationRole === 'org_admin' &&
      onboardingStatus === 'pending' &&
      !subscriptionGated
    ) {
      navigate('/onboarding', { replace: true });
    }
  }, [user, onboardingStatus, subscriptionGated, navigate]);
  const { hasPermission, orgRole, isAllianceAdmin } = usePermissions();
  // The Alliance Console entry is for NON-global alliance admins (customer IT — exists
  // in both managed and self-hosted). A global admin reaches every alliance through the
  // Platform Console (Platform › Alliances → drill in), so we hide this redundant second
  // door from them. `isAllianceAdmin` is true for every global admin, so gate on
  // non-global + an actual alliance_admin membership, then require a non-empty alliance
  // list so the link never dead-ends (same predicate ConsolePage resolves through).
  const isGlobalAdmin = user?.role === 'admin';
  // Alliance console is hidden product-wide until a real multi-workspace customer
  // exists (see ALLIANCE_CONSOLE_ENABLED). Gate the query on the flag too so we don't
  // fetch `/api/alliances/mine` for a surface that can never render.
  const canSeeAllianceConsole = ALLIANCE_CONSOLE_ENABLED && !isGlobalAdmin && isAllianceAdmin;
  const { data: myAlliances } = useMyAlliances(canSeeAllianceConsole);
  const showAllianceConsole = canSeeAllianceConsole && (myAlliances?.length ?? 0) > 0;
  const { hasFeature } = useFeatures();
  const { isSurfaceEnabled } = useUiFlags();
  const slaNotifications = useSLANotifications();
  const learningNotifications = useLearningNotifications();

  // For admins: use selectedOrganizationId to filter widgets by current org context.
  // WS-H-04: fall back to user.organizationId so the WS room is joined on first login
  // before OrganizationSwitcher auto-selects an org (avoids transient no-events window).
  // For regular users: use their user.organizationId
  const organizationFilter =
    user?.role === 'admin'
      ? (selectedOrganizationId ?? user?.organizationId ?? null)
      : user?.organizationId;

  const { sessions, removeSession } = useEmailProcessing(true, organizationFilter ?? undefined);
  // needs_routing badge now sources from the unified notification counts (P4) so
  // the sidebar and the Notification Center bell share one number.
  const { counts: notificationCounts } = useNotificationCounts();
  const needsRoutingCount = notificationCounts['needs_routing'] ?? 0;
  // Tickets nav stays hidden until the org has its first ticket.
  //
  // This used to treat `undefined` (loading) as "show", to avoid a flash that hid the
  // link from users who do have tickets. That traded one visible glitch for a worse one:
  // orgs with NO tickets watched the item appear and then vanish on every cold load —
  // and, because the count's queryKey carries org + dept, on every org/department switch
  // too. `useTicketsCount` now seeds from the last known count for that exact scope, so
  // the answer is normally already known at first render and neither flash occurs.
  // `undefined` therefore means "never fetched for this scope on this device", where
  // staying hidden is the honest default — it matches the feature's intent, and the link
  // appears as soon as the count confirms it.
  const { data: ticketsCount } = useTicketsCount();
  const hasTickets = (ticketsCount ?? 0) > 0;
  const hasRoutingItems = needsRoutingCount > 0;

  // Join/leave organization-specific WebSocket rooms for targeted event delivery
  useEffect(() => {
    if (organizationFilter) {
      joinOrganizationRoom(organizationFilter);

      // Leave room when organization changes or component unmounts
      return () => {
        leaveOrganizationRoom(organizationFilter);
      };
    } else {
      logger.warn(
        '[Layout] organizationFilter is undefined — WebSocket room NOT joined. user.organizationId:',
        user?.organizationId,
        'role:',
        user?.role
      );
    }
  }, [organizationFilter, user?.organizationId, user?.role]);

  // Persist closed sessions in localStorage to survive page navigation
  // Only track manually dismissed sessions — auto-close should not block future sessions
  const [closedSessions, setClosedSessions] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('closedEmailSessions');
      if (!stored) return new Set();
      const parsed = JSON.parse(stored) as unknown;
      if (!Array.isArray(parsed)) return new Set();
      // Filter out stale entries written by old code that didn't check _dismissed
      const verified = (parsed as string[]).filter(
        (key) => localStorage.getItem(`emailProcessingWidget_${key}_dismissed`) === 'true'
      );
      return new Set(verified);
    } catch {
      return new Set();
    }
  });

  // Sync header offset as a CSS variable so panels can offset themselves.
  // Always 3.5rem on mobile (main content has permanent pt-16 regardless of header visibility).
  useEffect(() => {
    const update = () => {
      document.documentElement.style.setProperty(
        '--mobile-header-h',
        window.innerWidth < 1024 ? '3.5rem' : '0px'
      );
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Header is always visible (auto-hide on scroll / detail-panel-open removed per request).

  // Handle session close
  const handleSessionClose = useCallback(
    (sessionKey: string) => {
      // Check if user manually dismissed BEFORE removeSession clears these keys
      const wasManuallyClosed =
        localStorage.getItem(`emailProcessingWidget_${sessionKey}_dismissed`) === 'true';

      // Remove from hook's session map and cleanup localStorage
      removeSession(sessionKey);

      // Only track in closedSessions for manual dismissals (X button).
      // Auto-close should not block future sessions from appearing.
      if (wasManuallyClosed) {
        setClosedSessions((prev) => {
          const newSet = new Set(prev).add(sessionKey);
          localStorage.setItem('closedEmailSessions', JSON.stringify(Array.from(newSet)));
          return newSet;
        });
      }
    },
    [removeSession]
  );

  // Auto-reopen widgets when a previously closed session starts processing again
  useEffect(() => {
    const activeSessionKeys = Array.from(sessions.entries())
      .filter(([_, session]) => session.isProcessing || session.status === 'started')
      .map(([sessionKey]) => sessionKey);

    if (activeSessionKeys.length > 0) {
      setClosedSessions((prev) => {
        const shouldUpdate = activeSessionKeys.some((key) => prev.has(key));
        if (!shouldUpdate) {
          return prev;
        }

        const newSet = new Set(prev);
        activeSessionKeys.forEach((key) => newSet.delete(key));
        // Persist to localStorage
        localStorage.setItem('closedEmailSessions', JSON.stringify(Array.from(newSet)));
        return newSet;
      });
    }
  }, [sessions]);

  // Get visible sessions (not closed and either processing or recently completed)
  // IMPORTANT: Filter by current department to avoid showing other departments' progress
  const visibleSessions = useMemo(() => {
    const filtered = Array.from(sessions.entries())
      .filter(([sessionKey, session]) => {
        // Always show actively processing sessions even if previously closed
        const isActive =
          session.isProcessing || session.status === 'started' || session.status === 'processing';
        if (isActive) return true;

        // Don't show if manually closed
        if (closedSessions.has(sessionKey)) {
          return false;
        }
        return session.status === 'complete' || session.status === 'error';
      })
      .map(([_, session]) => session);
    return filtered;
  }, [sessions, closedSessions]);

  const { data: backendVersion } = useBackendVersion();
  // Authoritative billing signal: true only when the BE has a billing provider
  // configured. Undefined (health call in-flight) is treated as billing-off so
  // billing UI never flashes before we know — it reveals once the flag arrives.
  const billingEnabled = backendVersion?.billingEnabled ?? false;

  // Filter navigation based on permissions
  const navigation = useMemo(
    () =>
      allNavigation.filter((item) => {
        // Check if admin-only and user is global admin
        if (item.adminOnly && user?.role !== 'admin') {
          return false;
        }
        // P3: hide entries a global admin now reaches via the platform console
        // (e.g. Workspace). Org admins / moderators keep them.
        if (item.hideForGlobalAdmin && user?.role === 'admin') {
          return false;
        }
        // Alliance console entry — non-global alliance_admins only (global admins use
        // the Platform Console, which drills into any alliance), and only when they
        // actually administer ≥1 alliance so the link never dead-ends.
        if (item.allianceAdmin && !showAllianceConsole) {
          return false;
        }
        // Customer-facing billing UI hidden whenever billing is off (self-hosted
        // or a managed box without a billing provider yet). Admin Plans /
        // Organization Usage live in the platform console (Billing & Plans) and are
        // unaffected — those are still needed to assign the admin plan.
        if (item.hideWhenBillingOff && !billingEnabled) {
          return false;
        }
        // Check feature gate (item hidden if feature not enabled for the org)
        if (item.featureRequired && !hasFeature(item.featureRequired)) {
          return false;
        }
        // Surface availability — is this screen BUILT? Separate from featureRequired,
        // which asks whether the plan includes it. An unfinished page must not appear
        // as an upsell, so this check is independent and either one hides the item.
        if (item.flagRequired && !isSurfaceEnabled(item.flagRequired)) {
          return false;
        }
        // Hide Tickets until the org actually has one. Cuts noise for inbox-only
        // teams; the link reappears the moment a ticket is created (60s polling).
        if (item.href === '/tickets' && !hasTickets) {
          return false;
        }
        if (item.href === '/needs-routing' && !hasRoutingItems) {
          return false;
        }
        if (!item.permission) {
          // Check permissions
          return true;
        } // No permission required (like Dashboard)
        return hasPermission(item.permission);
      }),
    [
      hasPermission,
      hasFeature,
      isSurfaceEnabled,
      user?.role,
      hasTickets,
      hasRoutingItems,
      billingEnabled,
      showAllianceConsole,
    ]
  );

  const handleLogout = () => {
    // Call BE to clear httpOnly cookie and revoke jwtVersion; fire-and-forget
    void apiClient.post('/api/auth/logout').catch(() => {});
    logout();
    navigate('/login');
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-gray-900/80 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <div className="flex flex-row flex-1 lg:overflow-hidden">
        {/* Sidebar - Hidden on mobile, visible on desktop */}
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-50 w-64 border-r transition-transform duration-300 transform bg-card',
            'lg:sticky lg:top-0 lg:h-screen lg:transform-none',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          )}
        >
          <div className="flex overflow-hidden flex-col h-full">
            <div className="flex justify-between items-center px-4 h-16 border-b">
              <div className="flex gap-2 items-center h-full min-w-0">
                <h1 className="text-xl font-bold">
                  <Link to="/">
                    <img
                      src="/odly_blue_logo.png"
                      alt="odly"
                      width={120}
                      height={32}
                      className="object-contain w-auto h-8"
                    />
                  </Link>
                </h1>
                <div className="self-end pb-1">
                  <VersionStatus />
                </div>
              </div>
              <Button
                className="lg:hidden"
                onClick={() => setSidebarOpen(false)}
                aria-label="Close sidebar"
              >
                <X className="w-6 h-6" />
              </Button>
            </div>

            <nav className="overflow-y-auto flex-1 px-4 py-4">
              {NAV_GROUP_ORDER.map((group, groupIdx) => {
                const items = navigation.filter((entry) => entry.group === group);
                if (items.length === 0) return null;
                return (
                  <div key={group} className={groupIdx > 0 ? 'mt-4' : ''}>
                    <p className="px-3 mb-1 text-[10px] font-semibold tracking-wider uppercase text-muted-foreground/70">
                      {NAV_GROUP_LABELS[group]}
                    </p>
                    <div className="space-y-1">
                      {items.map((item) => {
                        const Icon = item.icon;
                        const isActive = location.pathname === item.href;
                        const badge = item.showBadge ? needsRoutingCount : 0;
                        return (
                          <Link
                            key={item.name}
                            to={item.href}
                            className={cn(
                              'flex gap-3 items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
                              isActive
                                ? 'bg-primary text-primary-foreground'
                                : 'text-foreground/70 hover:bg-accent hover:text-accent-foreground'
                            )}
                            onClick={() => setSidebarOpen(false)}
                          >
                            <Icon className="w-5 h-5 flex-shrink-0" />
                            <span className="flex-1">{item.name}</span>
                            {badge > 0 && (
                              <span className="flex-shrink-0 flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-[10px] font-bold rounded-full bg-destructive text-destructive-foreground">
                                {badge > 99 ? '99+' : badge}
                              </span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </nav>

            <div className="p-4 border-t">
              {/* Organization Switcher for Global Admins */}
              <OrganizationSwitcher />
              {/* Department filter switcher for multi-dept users */}
              <DepartmentSwitcher />

              <div className="flex justify-between items-center mb-3">
                <div className="flex gap-2 items-center min-w-0">
                  <div className="flex flex-shrink-0 justify-center items-center w-8 h-8 text-sm font-medium rounded-full bg-primary text-primary-foreground">
                    {user?.firstName?.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {user?.firstName} {user?.lastName}
                    </p>
                    <p className="text-xs truncate text-muted-foreground">
                      {orgRole ? roleDisplayNames[orgRole] : roleDisplayNames[user?.role ?? 'user']}
                    </p>
                  </div>
                </div>
                <div className="flex flex-shrink-0 gap-1 items-center">
                  <NotificationCenter sla={slaNotifications} learning={learningNotifications} />
                  <ThemeToggle />
                </div>
              </div>
              <Button
                variant="ghost"
                onClick={handleLogout}
                className="gap-2 justify-start w-full text-sm text-foreground/70 hover:bg-accent hover:text-accent-foreground"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </Button>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex flex-col flex-1 w-full lg:overflow-x-hidden lg:ml-0 bg-background">
          {/* Mobile header with hamburger menu — always visible */}
          <header
            className={cn(
              'flex fixed top-0 right-0 left-0 z-[65] justify-between items-center px-4 h-14 border-b bg-card lg:hidden'
            )}
          >
            <div className="flex items-center">
              <Button
                className="mr-4"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open sidebar"
              >
                <Menu className="w-6 h-6" />
              </Button>
              <h2 className="text-lg font-semibold">
                {getPageTitle(location.pathname, navigation)}
              </h2>
            </div>
            <div className="flex gap-1 items-center">
              <NotificationCenter sla={slaNotifications} learning={learningNotifications} />
              <ThemeToggle />
            </div>
          </header>
          {/*
            On desktop the shell is a fixed 100vh frame (root `h-screen`, row
            `lg:overflow-hidden`) and THIS pane is the only thing that scrolls — the same
            split AdminShell/WorkspaceShell use. It was missing `lg:overflow-y-auto`, so a
            tall page had nowhere to scroll: the height leaked past the frame, the DOCUMENT
            scrolled instead, and that dragged the sidebar up with it (its `lg:sticky` is
            inert here — sticky does nothing when an ancestor is `overflow:hidden`). Hence
            two scrollbars and dead space under the shell.
            `lg:min-h-0` is load-bearing: a flex child defaults to `min-height:auto` and
            refuses to shrink below its content, which keeps the overflow on the document
            no matter what overflow you set here.
            Scoped to `lg` so mobile keeps scrolling the document, which is what the
            fixed mobile header and `pt-16` are built around.
          */}
          <main className="flex flex-col flex-1 p-2 pt-16 w-full max-w-full lg:min-h-0 lg:overflow-y-auto lg:overflow-x-hidden lg:p-4 lg:pt-4 bg-background">
            <LicenseExpiryBanner />
            <ResumeSetupBanner />
            <TrialBanner />
            {children}
          </main>
          <SubscriptionGateOverlay />
        </div>
      </div>

      {/* WebSocket Status Indicator */}
      {isDevelopment && <WebSocketStatus />}

      {/* WebSocket Debug Panel (Development Only) */}
      {isDevelopment && <WebSocketDebug />}

      {/* Message Processing Progress Widgets (Multiple instances for parallel processing) */}
      {visibleSessions.map((session, index) => (
        <MessageProcessingProgress
          key={session.sessionKey}
          session={session}
          index={index}
          onClose={handleSessionClose}
          sourceType="email"
        />
      ))}
    </div>
  );
};
