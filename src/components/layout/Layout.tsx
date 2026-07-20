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
  Building2,
  CreditCard,
  TrendingUp,
  BookOpen,
  Receipt,
  Trash2,
  GitBranch,
  ShieldAlert,
  MailOpen,
  MailWarning,
  ScrollText,
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { useEmailProcessing } from '@/hooks/useEmailProcessing';
import { usePermissions } from '@/hooks/usePermissions';
import { useModules } from '@/hooks/useModules';
import { useBackendVersion } from '@/hooks/useBackendVersion';
import { joinOrganizationRoom, leaveOrganizationRoom } from '@/lib/socketManager';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { apiClient } from '@/lib/api-client';
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
type NavGroup = 'work' | 'insights' | 'admin';

const allNavigation: Array<{
  group: NavGroup;
  name: string;
  href: string;
  icon: typeof LayoutDashboard;
  permission?: Permission;
  adminOnly?: boolean;
  moduleRequired?: string;
  showBadge?: boolean;
  hideOnSelfHosted?: boolean;
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
  },
  {
    group: 'insights',
    name: 'Billing Intelligence',
    href: '/billing',
    icon: Receipt,
    permission: Permission.VIEW_BILLING,
    moduleRequired: 'billing-intelligence',
    hideOnSelfHosted: true,
  },

  // ─── Admin — configuration & rare-use ───────────────────────────────────────
  { group: 'admin', name: 'Users', href: '/users', icon: Users, permission: Permission.VIEW_USERS },
  { group: 'admin', name: 'Organization', href: '/organization', icon: Building2 },
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
    hideOnSelfHosted: true,
  },
  {
    group: 'admin',
    name: 'Email Templates',
    href: '/email-templates',
    icon: MailOpen,
    adminOnly: true,
  },
  {
    group: 'admin',
    name: 'Audit Logs',
    href: '/audit-logs',
    icon: ScrollText,
    permission: Permission.VIEW_AUDIT_LOGS,
  },
  {
    group: 'admin',
    name: 'Admin Dashboard',
    href: '/admin',
    icon: ShieldAlert,
    adminOnly: true,
  },
  {
    group: 'admin',
    name: 'Deleted Messages',
    href: '/deleted-messages',
    icon: Trash2,
    adminOnly: true,
  },
  {
    group: 'admin',
    name: 'Orphaned Outbound',
    href: '/orphaned-outbound',
    icon: MailWarning,
    adminOnly: true,
  },
];

// 'admin' is the internal group key, but the user-facing label is 'Manage' because
// most items in this group (Users, Organization, Settings, Subscription, Audit Logs)
// are visible to moderators with the matching permission — not just global admins.
// Calling the section "Admin" misled moderators into thinking they were viewing
// admin-restricted content. The strictly admin-only items (Admin Dashboard, Email
// Templates, Deleted Messages) still appear here but the section header is
// role-neutral. A full role-aware split into separate moderator/admin groups remains
// a future task — see [PLAN] Role-aware nav grouping.
const NAV_GROUP_LABELS: Record<NavGroup, string> = {
  work: 'Work',
  insights: 'Insights',
  admin: 'Manage',
};
const NAV_GROUP_ORDER: NavGroup[] = ['work', 'insights', 'admin'];

/**
 * Routes that are reachable but don't have a top-nav entry. Used so the mobile
 * breadcrumb shows the right title instead of falling back to "Dashboard".
 */
const DEEP_ROUTE_TITLES: Record<string, string> = {
  '/pricing': 'Pricing',
  '/tickets/create': 'Create Ticket',
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
  const { hasPermission, orgRole } = usePermissions();
  const { hasModule } = useModules();
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
  // Tickets nav stays hidden until the org has its first ticket. `undefined` =
  // still loading; treat as "show" to avoid a brief flash that hides the link
  // for users who do have tickets.
  const { data: ticketsCount } = useTicketsCount();
  const hasTickets = ticketsCount === undefined || ticketsCount > 0;
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
  const isSelfHosted = backendVersion?.selfHosted ?? false;

  // Filter navigation based on permissions
  const navigation = useMemo(
    () =>
      allNavigation.filter((item) => {
        // Check if admin-only and user is global admin
        if (item.adminOnly && user?.role !== 'admin') {
          return false;
        }
        // Customer-facing billing UI hidden on self-hosted deployments. Admin
        // Plans & Modules / Organization Usage live on AdminDashboardPage and
        // are unaffected — those are still needed to assign the admin plan.
        if (item.hideOnSelfHosted && isSelfHosted) {
          return false;
        }
        // Check module gate (item hidden if module not enabled for the org)
        if (item.moduleRequired && !hasModule(item.moduleRequired)) {
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
    [hasPermission, hasModule, user?.role, hasTickets, hasRoutingItems, isSelfHosted]
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
          <main className="flex flex-col flex-1 p-2 pt-16 w-full max-w-full lg:overflow-x-hidden lg:p-4 lg:pt-4 bg-background">
            <LicenseExpiryBanner />
            {children}
          </main>
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
