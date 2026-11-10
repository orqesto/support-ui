/**
 * WIRING (2026-11-10): the old /sla page was gated on view_statistics; it now redirects to
 * Statistics → Performance, so /statistics carries the same gate. Without it, a member whose
 * view_statistics was revoked reached the page by URL (the nav hides it) and saw only errors,
 * because the API refuses the data.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '@/App';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@/types';

vi.mock('@/pages/StatisticsPage', () => ({ StatisticsPage: () => <p>statistics page</p> }));
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
const signIn = (removed: string[]) =>
  useAuthStore.setState({
    isAuthenticated: true,
    user: {
      id: 1,
      email: 'agent@example.com',
      role: 'user',
      organizationRole: 'support',
      permissionOverrides: { added: [], removed },
    } as unknown as User,
  });

afterEach(() => {
  useAuthStore.setState({ isAuthenticated: false, user: null });
  at('/');
});

describe('Statistics route', () => {
  it.each(['/statistics#performance', '/sla?days=7'])(
    'a member without view_statistics opening %s lands on the dashboard',
    async (path) => {
      signIn(['view_statistics']);
      at(path);
      render(<App />);
      expect(await screen.findByText('dashboard page')).toBeTruthy();
      expect(screen.queryByText('statistics page')).toBeNull();
    }
  );

  it.each(['/statistics#performance', '/sla?days=7'])(
    'CONTROL: a support agent opens %s',
    async (path) => {
      signIn([]);
      at(path);
      render(<App />);
      expect(await screen.findByText('statistics page')).toBeTruthy();
    }
  );
});
