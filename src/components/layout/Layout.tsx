import { useState, useMemo, useEffect, type ReactNode } from 'react';
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
  Briefcase,
  FileText,
  CreditCard,
  TrendingUp,
  BookOpen,
  Activity,
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { useEmailProcessing } from '@/hooks/useEmailProcessing';
import { usePermissions } from '@/hooks/usePermissions';
import { joinOrganizationRoom, leaveOrganizationRoom } from '@/lib/socketManager';
import { cn } from '@/lib/utils';
import { organizationService, type Organization } from '@/services/organization.service';
import { useAuthStore } from '@/stores/authStore';
import { Permission, roleDisplayNames } from '@/types/roles';
import { OrganizationSwitcher } from './OrganizationSwitcher';
import { DepartmentSwitcher } from './DepartmentSwitcher';
import { ThemeToggle } from './ThemeToggle';
import { WebSocketStatus } from '../shared/WebSocketStatus';
import { WebSocketDebug } from '../shared/WebSocketDebug';
import { MessageProcessingProgress } from '../messages/MessageProcessingProgress';

const isDevelopment = import.meta.env.DEV;

type LayoutProps = {
  children: ReactNode;
};

const allNavigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Messages', href: '/messages', icon: Mail, permission: Permission.VIEW_MESSAGES },
  { name: 'Tickets', href: '/tickets', icon: Ticket, permission: Permission.VIEW_TICKETS },
  {
    name: 'Knowledge Base',
    href: '/knowledge-base',
    icon: BookOpen,
    permission: Permission.VIEW_MESSAGES,
  },
  {
    name: 'Statistics',
    href: '/statistics',
    icon: BarChart3,
    permission: Permission.VIEW_STATISTICS,
  },
  {
    name: 'SLA Performance',
    href: '/sla',
    icon: Activity,
    permission: Permission.VIEW_STATISTICS,
  },
  {
    name: 'Usage Stats',
    href: '/usage-stats',
    icon: TrendingUp,
    permission: Permission.VIEW_USAGE_STATS,
  },
  { name: 'Organization', href: '/organization', icon: Building2 },
  {
    name: 'Settings',
    href: '/settings',
    icon: Settings,
    permission: Permission.VIEW_ORGANIZATION_SETTINGS,
  },
  {
    name: 'Subscription',
    href: '/subscription',
    icon: CreditCard,
    permission: Permission.VIEW_SUBSCRIPTION,
  },
  { name: 'Users', href: '/users', icon: Users, permission: Permission.VIEW_USERS },
  {
    name: 'Email Templates',
    href: '/email-templates',
    icon: FileText,
    adminOnly: true, // Only visible to global admins
  },
  {
    name: 'Admin Dashboard',
    href: '/admin',
    icon: Settings,
    adminOnly: true, // Only visible to global admins
  },
  {
    name: 'Audit Logs',
    href: '/audit-logs',
    icon: FileText,
    permission: Permission.VIEW_AUDIT_LOGS,
  },
];

export const Layout = ({ children }: LayoutProps) => {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const selectedDepartmentRole = useAuthStore((state) => state.selectedDepartmentRole);
  const selectedOrganizationId = useAuthStore((state) => state.selectedOrganizationId);
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { hasPermission, orgRole } = usePermissions();

  // State for organization name
  const [selectedOrgName, setSelectedOrgName] = useState<string>('Organization');

  // For admins: use selectedOrganizationId to filter widgets by current org context
  // For regular users: use their user.organizationId
  const organizationFilter = user?.role === 'admin' ? selectedOrganizationId : user?.organizationId;

  // Fetch organization name for admins
  useEffect(() => {
    if (user?.role === 'admin' && selectedOrganizationId) {
      organizationService
        .getAll('', 1, 100)
        .then((result) => {
          const org = result.data.find((o: Organization) => o.id === selectedOrganizationId);
          if (org) {
            setSelectedOrgName(org.name);
          }
        })
        .catch((error) => {
          console.error('Failed to load organization name:', error);
        });
    }
  }, [selectedOrganizationId, user?.role]);
  const { sessions, removeSession } = useEmailProcessing(
    true,
    selectedDepartmentRole ?? undefined,
    organizationFilter ?? undefined
  );

  // Join/leave organization-specific WebSocket rooms for targeted event delivery
  useEffect(() => {
    if (organizationFilter) {
      // Wait for socket to connect before joining room
      const timer = setTimeout(() => {
        joinOrganizationRoom(organizationFilter);
      }, 1000);

      // Leave room when organization changes or component unmounts
      return () => {
        clearTimeout(timer);
        leaveOrganizationRoom(organizationFilter);
      };
    }
  }, [organizationFilter]);

  // Persist closed sessions in localStorage to survive page navigation
  // Use sessionKey (integrationId-departmentRole) to track closed sessions
  const [closedSessions, setClosedSessions] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('closedEmailSessions');
      if (!stored) {
        return new Set();
      }
      const parsed = JSON.parse(stored) as unknown;
      return Array.isArray(parsed) ? new Set(parsed as string[]) : new Set();
    } catch {
      return new Set();
    }
  });

  // Handle session close
  const handleSessionClose = (sessionKey: string) => {
    // Remove from hook's session map and cleanup localStorage
    removeSession(sessionKey);

    // Also remove from local closed sessions tracking
    setClosedSessions((prev) => {
      const newSet = new Set(prev).add(sessionKey);
      // Persist to localStorage
      localStorage.setItem('closedEmailSessions', JSON.stringify(Array.from(newSet)));
      return newSet;
    });
  };

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
        // Don't show if manually closed
        if (closedSessions.has(sessionKey)) {
          return false;
        }
        const shouldShow =
          session.isProcessing ||
          session.status === 'started' ||
          session.status === 'processing' ||
          session.status === 'complete' ||
          session.status === 'error';
        return shouldShow;
      })
      .map(([_, session]) => session);
    return filtered;
  }, [sessions, closedSessions]);

  // Filter navigation based on permissions
  const navigation = useMemo(
    () =>
      allNavigation.filter((item) => {
        // Check if admin-only and user is global admin
        if (item.adminOnly && user?.role !== 'admin') {
          return false;
        }
        // Check permissions
        if (!item.permission) {
          return true;
        } // No permission required (like Dashboard)
        return hasPermission(item.permission);
      }),
    [hasPermission, user?.role]
  );

  const handleLogout = () => {
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
              <h1 className="text-xl font-bold">
                <Link
                  to={`/`}>
                  <img
                    src="/odly_blue_logo.png"
                    alt="odly"
                    width={120}
                    height={32}
                    className="h-8 w-auto object-contain"
                  />
                </Link>
              </h1>
              <Button className="lg:hidden" onClick={() => setSidebarOpen(false)}>
                <X className="w-6 h-6" />
              </Button>
            </div>

            <nav className="overflow-y-auto flex-1 px-4 py-4 space-y-1">
              {navigation.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.href;
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
                    <Icon className="w-5 h-5" />
                    {item.name}
                  </Link>
                );
              })}
            </nav>

            <div className="p-4 border-t">
              {/* Current Context Indicator */}
              {(user?.role === 'admin' && selectedOrganizationId) || selectedDepartmentRole ? (
                <div className="mb-3 p-2.5 rounded-lg bg-primary/5 border border-primary/20">
                  <p className="mb-2 text-xs font-semibold tracking-wide uppercase text-muted-foreground">
                    Workspace
                  </p>
                  {user?.role === 'admin' && selectedOrganizationId && (
                    <div className="flex gap-2 items-center mb-1.5">
                      <Building2 className="w-3.5 h-3.5 text-primary" />
                      <span className="text-sm font-medium truncate text-foreground">
                        {selectedOrgName}
                      </span>
                    </div>
                  )}
                  {selectedDepartmentRole && (
                    <div className="flex gap-2 items-center">
                      <Briefcase className="w-3.5 h-3.5 text-primary" />
                      <span className="text-sm font-medium text-foreground">
                        {selectedDepartmentRole.charAt(0).toUpperCase() +
                          selectedDepartmentRole.slice(1)}
                      </span>
                    </div>
                  )}
                </div>
              ) : null}

              {/* Organization Switcher for Global Admins */}
              <OrganizationSwitcher />

              {/* Department Switcher for Multi-Department Users */}
              <DepartmentSwitcher />

              <div className="flex justify-between items-center mb-3">
                <div className="flex gap-2 items-center">
                  <div className="flex justify-center items-center w-8 h-8 text-sm font-medium rounded-full bg-primary text-primary-foreground">
                    {user?.firstName?.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {user?.firstName} {user?.lastName}
                    </p>
                    <p className="text-xs truncate text-muted-foreground">
                      {orgRole ? roleDisplayNames[orgRole] : roleDisplayNames[user?.role ?? 'user']}
                    </p>
                  </div>
                </div>
                <ThemeToggle />
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
          {/* Mobile header with hamburger menu */}
          <header className="flex fixed top-0 right-0 left-0 z-50 justify-between items-center px-4 h-14 border-b bg-card lg:hidden">
            <div className="flex items-center">
              <Button className="mr-4" onClick={() => setSidebarOpen(true)}>
                <Menu className="w-6 h-6" />
              </Button>
              <h2 className="text-lg font-semibold">
                {navigation.find((item) => item.href === location.pathname)?.name ?? 'Dashboard'}
              </h2>
            </div>
            <ThemeToggle />
          </header>
          {/* Spacer for fixed header */}
          <div className="h-14 lg:hidden" />

          <main className="flex flex-col flex-1 p-2 w-full max-w-full lg:overflow-x-hidden lg:p-4 bg-background">
            {children}
          </main>
        </div>
      </div>

      {/* WebSocket Status Indicator */}
      <WebSocketStatus />

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
