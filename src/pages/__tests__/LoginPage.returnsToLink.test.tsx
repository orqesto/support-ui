/**
 * A ticket link opened while signed out (a phone, an expired session) must open that ticket once
 * the user signs in — it used to land on /login with the address dropped, then on /dashboard.
 * Drives the real guard, the real login page and the real SSO landing; only the network is faked.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

vi.mock('@/components/common/Turnstile', () => ({ Turnstile: () => null }));
vi.mock('@/services/auth.service', () => ({
  authService: {
    checkEmail: () => Promise.resolve({ success: true }),
    login: () =>
      Promise.resolve({
        success: true,
        data: { user: { id: 1, email: 'agent@example.com', role: 'user', organizationId: 7 } },
      }),
  },
}));
vi.mock('@/services/user.service', () => ({
  userService: {
    getCurrentUser: () =>
      Promise.resolve({
        id: 1,
        email: 'agent@example.com',
        role: 'user',
        organizationId: 7,
      }),
  },
}));

const { LoginPage } = await import('../LoginPage');
const { SsoCallbackPage } = await import('../SsoCallbackPage');
const { ProtectedRoute } = await import('@/components/auth/ProtectedRoute');
const { useAuthStore } = await import('@/stores/authStore');

const Where = () => {
  const location = useLocation();
  return <div data-testid="where">{`${location.pathname}${location.search}`}</div>;
};

const renderAt = (entry: string) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/sso/callback" element={<SsoCallbackPage />} />
        <Route
          path="/tickets"
          element={
            <ProtectedRoute>
              <Where />
            </ProtectedRoute>
          }
        />
        <Route
          path="/tickets/:id"
          element={
            <ProtectedRoute>
              <Where />
            </ProtectedRoute>
          }
        />
        <Route path="/dashboard" element={<Where />} />
      </Routes>
    </MemoryRouter>
  );

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  useAuthStore.setState({ isAuthenticated: false, user: null });
});

const signInWithPassword = async () => {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'agent@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  const password = await screen.findByLabelText('Password');
  fireEvent.change(password, { target: { value: 'pw' } });
  fireEvent.submit(password.closest('form')!);
};

describe('a ticket link opened while signed out', () => {
  it('password sign-in opens the ticket the link pointed at', async () => {
    renderAt('/tickets?id=101&needs=yes&sort=createdAt');
    await signInWithPassword();
    await waitFor(() =>
      expect(screen.getByTestId('where').textContent).toBe(
        '/tickets?id=101&needs=yes&sort=createdAt'
      )
    );
  });

  it('the full ticket page link works the same', async () => {
    renderAt('/tickets/101');
    await signInWithPassword();
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/tickets/101'));
  });

  it('SSO sign-in comes back to the ticket', async () => {
    sessionStorage.setItem('odly:post-login-next', '/tickets/101');
    renderAt('/sso/callback?sso=1');
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/tickets/101'));
  });

  it('CONTROL: plain /login still goes to the dashboard', async () => {
    renderAt('/login');
    await signInWithPassword();
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/dashboard'));
  });
});
