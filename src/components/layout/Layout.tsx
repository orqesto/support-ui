import { useState, useMemo } from 'react';
import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { usePermissions } from '@/hooks/usePermissions';
import { Permission, roleDisplayNames } from '@/types/roles';
import { WebSocketStatus } from '@/components/WebSocketStatus';
import { WebSocketDebug } from '@/components/WebSocketDebug';
import { OrganizationSwitcher } from '@/components/OrganizationSwitcher';
import { ThemeToggle } from '@/components/ThemeToggle';
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
import { cn } from '@/lib/utils';

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
];

export const Layout = ({ children }: LayoutProps) => {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { hasPermission, orgRole } = usePermissions();

  // Filter navigation based on permissions
  const navigation = useMemo(() => {
    return allNavigation.filter((item) => {
      // Check if admin-only and user is global admin
      if (item.adminOnly && user?.role !== 'admin') return false;
      // Check permissions
      if (!item.permission) return true; // No permission required (like Dashboard)
      return hasPermission(item.permission);
    });
  }, [hasPermission, user?.role]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile sidebar backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-gray-900/80 lg:hidden',
          sidebarOpen ? 'block' : 'hidden'
        )}
        onClick={() => setSidebarOpen(false)}
      />

      <div className="flex flex-row">
        {/* Sidebar - Hidden on mobile, visible on desktop */}
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-50 w-64 bg-card border-r transition-transform duration-300 transform',
            'lg:sticky lg:top-0 lg:h-screen lg:transform-none',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          )}
        >
          <div className="flex overflow-hidden flex-col h-full">
            <div className="flex justify-between items-center px-4 h-16 border-b">
              <h1 className="text-xl font-bold">Support System</h1>
              <button className="lg:hidden" onClick={() => setSidebarOpen(false)}>
                <X className="w-6 h-6" />
              </button>
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
                      {orgRole ? roleDisplayNames[orgRole] : roleDisplayNames[user?.role || 'user']}
                    </p>
                  </div>
                </div>
                <ThemeToggle />
              </div>
              <button
                onClick={handleLogout}
                className="flex gap-2 items-center px-3 py-2 w-full text-sm rounded-md transition-colors text-foreground/70 hover:bg-accent hover:text-accent-foreground"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div className="overflow-x-hidden flex-1 w-full lg:ml-0 bg-background">
          {/* Mobile header with hamburger menu */}
          <header className="flex fixed top-0 right-0 left-0 z-50 justify-between items-center px-4 h-14 bg-card border-b lg:hidden">
            <div className="flex items-center">
              <button className="mr-4" onClick={() => setSidebarOpen(true)}>
                <Menu className="w-6 h-6" />
              </button>
              <h2 className="text-lg font-semibold">
                {navigation.find((item) => item.href === location.pathname)?.name || 'Dashboard'}
              </h2>
            </div>
            <ThemeToggle />
          </header>
          {/* Spacer for fixed header */}
          <div className="h-14 lg:hidden"></div>

          <main className="overflow-x-hidden p-4 w-full max-w-full lg:p-6 bg-background">{children}</main>
        </div>
      </div>

      {/* WebSocket Status Indicator */}
      <WebSocketStatus />

      {/* WebSocket Debug Panel (Development Only) */}
      {isDevelopment && <WebSocketDebug />}
    </div>
  );
};
