/**
 * WIRING (2026-11-23): a global admin opening /audit-logs was redirected to the platform console's
 * audit page, which has no automatic-replies view and lists none of the sent / held / "would have
 * been sent" entries. The settings screen sends every admin to Audit Logs to read those, so a
 * global admin could not follow it. The workspace page now opens for a global admin as well.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '@/App';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@/types';

vi.mock('@/pages/AuditLogsPage', () => ({ AuditLogsPage: () => <p>workspace audit page</p> }));
vi.mock('@/pages/DashboardPage', () => ({
  DashboardPage: () => <p>dashboard page</p>,
  default: () => <p>dashboard page</p>,
}));
vi.mock('@/pages/LoginPage', () => ({ LoginPage: () => <p>login page</p> }));
vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/hooks/useRolePermissionMatrix', () => ({ useRolePermissionMatrix: () => {} }));

const at = (path: string) => window.history.pushState({}, '', path);
const signIn = (user: Partial<User>) =>
  useAuthStore.setState({
    isAuthenticated: true,
    user: { id: 1, email: 'someone@example.com', ...user } as unknown as User,
  });

afterEach(() => {
  useAuthStore.setState({ isAuthenticated: false, user: null });
  at('/');
});

describe('Audit Logs route', () => {
  it('a global admin opening /audit-logs sees the workspace audit page, not the platform console', async () => {
    signIn({ role: 'admin', organizationRole: 'org_admin' });
    at('/audit-logs');
    render(<App />);
    expect(await screen.findByText('workspace audit page')).toBeTruthy();
    expect(window.location.pathname).toBe('/audit-logs');
  });

  it('CONTROL: a workspace admin still sees the workspace audit page', async () => {
    signIn({ role: 'user', organizationRole: 'org_admin' });
    at('/audit-logs');
    render(<App />);
    expect(await screen.findByText('workspace audit page')).toBeTruthy();
  });

  it('CONTROL: a support agent, who has no view_audit_logs, lands on the dashboard', async () => {
    signIn({ role: 'user', organizationRole: 'support' });
    at('/audit-logs');
    render(<App />);
    expect(await screen.findByText('dashboard page')).toBeTruthy();
    expect(screen.queryByText('workspace audit page')).toBeNull();
  });
});
