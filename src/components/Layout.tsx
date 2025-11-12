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
  FileText,
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { DepartmentSwitcher } from '@/components/DepartmentSwitcher';
import { MessageProcessingProgress } from '@/components/MessageProcessingProgress';
import { OrganizationSwitcher } from '@/components/OrganizationSwitcher';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/Button';
import { WebSocketDebug } from '@/components/WebSocketDebug';
import { WebSocketStatus } from '@/components/WebSocketStatus';
import { useEmailProcessing } from '@/hooks/useEmailProcessing';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { Permission, roleDisplayNames } from '@/types/roles';

const isDevelopment = import.meta.env.DEV;

type LayoutProps = {
  children: ReactNode;
};

const allNavigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Messages', href: '/messages', icon: Mail, permission: Permission.VIEW_MESSAGES },
  { name: 'Tickets', href: '/tickets', icon: Ticket, permission: Permission.VIEW_TICKETS },
  {
    name: 'Statistics',
    href: '/statistics',
    icon: BarChart3,
    permission: Permission.VIEW_STATISTICS,
  },
  { name: 'Organization', href: '/organization', icon: Building2 },
  {
    name: 'Settings',
    href: '/settings',
    icon: Settings,
    permission: Permission.VIEW_ORGANIZATION_SETTINGS,
  },
  { name: 'Users', href: '/users', icon: Users, permission: Permission.VIEW_USERS },
  {
    name: 'Email Templates',
    href: '/email-templates',
    icon: FileText,
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
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { hasPermission, orgRole } = usePermissions();

  // Track multiple email processing sessions
  const { sessions } = useEmailProcessing(true);

  // Persist closed sessions in localStorage to survive page navigation
  const [closedSessions, setClosedSessions] = useState<Set<number>>(() => {
    try {
      const stored = localStorage.getItem('closedEmailSessions');
      if (!stored) {
        return new Set();
      }
      const parsed = JSON.parse(stored) as unknown;
      return Array.isArray(parsed) ? new Set(parsed as number[]) : new Set();
    } catch {
      return new Set();
    }
  });

  // Handle session close
  const handleSessionClose = (integrationId: number) => {
    setClosedSessions((prev) => {
      const newSet = new Set(prev).add(integrationId);
      // Persist to localStorage
      localStorage.setItem('closedEmailSessions', JSON.stringify(Array.from(newSet)));
      return newSet;
    });
  };

  // Auto-reopen widgets when a previously closed session starts processing again
  useEffect(() => {
    const activeIntegrationIds = Array.from(sessions.entries())
      .filter(([_, session]) => session.isProcessing || session.status === 'started')
      .map(([id]) => id);

    if (activeIntegrationIds.length > 0) {
      setClosedSessions((prev) => {
        const shouldUpdate = activeIntegrationIds.some((id) => prev.has(id));
        if (!shouldUpdate) {
          return prev;
        }

        const newSet = new Set(prev);
        activeIntegrationIds.forEach((id) => newSet.delete(id));
        // Persist to localStorage
        localStorage.setItem('closedEmailSessions', JSON.stringify(Array.from(newSet)));
        return newSet;
      });
    }
  }, [sessions]);

  // Get visible sessions (not closed and either processing or recently completed)
  const visibleSessions = useMemo(
    () => {
      console.log('[Layout] Sessions Map:', Array.from(sessions.entries()).map(([id, s]) => ({
        id,
        name: s.integrationName,
        status: s.status,
        isProcessing: s.isProcessing,
        total: s.total,
        current: s.current
      })));
      
      const filtered = Array.from(sessions.entries())
        .filter(([integrationId, session]) => {
          // Don't show if manually closed
          if (closedSessions.has(integrationId)) {
            console.log(`[Layout] Filtering out ${session.integrationName}: manually closed`);
            return false;
          }
          // Show if processing or recently completed
          const shouldShow = session.isProcessing || session.status === 'complete' || session.status === 'error';
          console.log(`[Layout] ${session.integrationName}: shouldShow=${shouldShow} (isProcessing=${session.isProcessing}, status=${session.status})`);
          return shouldShow;
        })
        .map(([_, session]) => session);
      
      console.log('[Layout] Visible sessions count:', filtered.length);
      return filtered;
    },
    [sessions, closedSessions]
  );

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

      <div className="flex overflow-hidden flex-row flex-1">
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
              <h1 className="text-xl font-bold">Support System</h1>
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
        <div className="flex overflow-x-hidden flex-col flex-1 w-full lg:ml-0 bg-background">
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

          <main className="flex overflow-x-hidden flex-col flex-1 p-2 w-full max-w-full lg:p-4 bg-background">
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
          key={session.integrationId}
          session={session}
          index={index}
          onClose={handleSessionClose}
          sourceType="email"
        />
      ))}
    </div>
  );
};
