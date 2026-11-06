/**
 * WIRING (bug 2026-11-06, same class as Settings): the New ticket button is hidden without
 * create_tickets, but /tickets/create and /tickets/edit/:id were reachable by URL for any member —
 * an Associate got the form and a 403 on save. The REAL route table now gates both pages on the
 * permission their save needs.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '@/App';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@/types';

vi.mock('@/pages/CreateTicketPage', () => ({ CreateTicketPage: () => <p>create ticket page</p> }));
vi.mock('@/pages/EditTicketPage', () => ({ EditTicketPage: () => <p>edit ticket page</p> }));
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
const signInAs = (organizationRole: string) =>
  useAuthStore.setState({
    isAuthenticated: true,
    user: { id: 1, email: 'agent@example.com', role: 'user', organizationRole } as User,
  });

afterEach(() => {
  useAuthStore.setState({ isAuthenticated: false, user: null });
  at('/');
});

describe('ticket form routes', () => {
  it.each([
    ['/tickets/create', 'create ticket page'],
    ['/tickets/edit/7', 'edit ticket page'],
  ])('an associate opening %s by URL lands on the dashboard', async (path, page) => {
    signInAs('associate');
    at(path);
    render(<App />);
    expect(await screen.findByText('dashboard page')).toBeTruthy();
    expect(screen.queryByText(page)).toBeNull();
  });

  it.each([
    ['/tickets/create', 'create ticket page'],
    ['/tickets/edit/7', 'edit ticket page'],
  ])('CONTROL: a support agent opens %s', async (path, page) => {
    signInAs('support');
    at(path);
    render(<App />);
    expect(await screen.findByText(page)).toBeTruthy();
  });
});
