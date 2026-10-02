/**
 * Verify email first (2026-10-01) — the verify page half (split from VerifyEmailFirst.test.tsx for
 * the file-length limit). Signup no longer signs in: the page turns into "check your
 * inbox", and the emailed link signs in only the browser that signed up. Both pages must also
 * keep working against a BE from before the change (FE can reach prod first).
 */
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ROUTER_FUTURE } from '@/test/routerFuture';
import { afterEach, describe, expect, it, vi } from 'vitest';

const signup = vi.fn();
const verifyEmail = vi.fn();
const resendPendingSignup = vi.fn();
const changePendingSignupEmail = vi.fn();
const login = vi.fn();
const setSelectedOrganization = vi.fn();

vi.mock('@/services/auth.service', () => ({
  authService: {
    signup: (...args: unknown[]) => signup(...args) as unknown,
    verifyEmail: (...args: unknown[]) => verifyEmail(...args) as unknown,
    resendPendingSignup: (...args: unknown[]) => resendPendingSignup(...args) as unknown,
    changePendingSignupEmail: (...args: unknown[]) => changePendingSignupEmail(...args) as unknown,
  },
}));

vi.mock('@/components/common/Turnstile', () => ({
  Turnstile: () => null,
  isTurnstileConfigured: () => false,
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (state: unknown) => unknown) => select({ login, setSelectedOrganization }),
}));

const { VerifyEmailPage } = await import('@/pages/VerifyEmailPage');

const user = { id: 7, email: 'ann@acme.test', organizationId: 40 };

const renderAt = (path: string, element: React.ReactNode) =>
  render(
    <MemoryRouter future={ROUTER_FUTURE} initialEntries={[path]}>
      <Routes>
        <Route path={path.split('#')[0]} element={element} />
        <Route path="/dashboard" element={<div>DASHBOARD</div>} />
        <Route path="/login" element={<div>LOGIN</div>} />
      </Routes>
    </MemoryRouter>
  );

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.location.hash = '';
  window.sessionStorage.clear();
});

describe('VerifyEmailPage — verify first', () => {
  it('signs in and opens the app when the BE signed this browser in', async () => {
    window.location.hash = '#token=abc';
    verifyEmail.mockResolvedValue({ success: true, data: { signedIn: true, user } });
    renderAt('/verify-email', <VerifyEmailPage />);

    expect(await screen.findByText('DASHBOARD')).toBeInTheDocument();
    expect(login).toHaveBeenCalledWith(null, user);
    expect(setSelectedOrganization).toHaveBeenCalledWith(40);
  });

  it('shows "verified, sign in" when opened in another browser', async () => {
    window.location.hash = '#token=abc';
    verifyEmail.mockResolvedValue({
      success: true,
      message: 'Email verified successfully. You can now login.',
      data: { signedIn: false },
    });
    renderAt('/verify-email', <VerifyEmailPage />);

    expect(await screen.findByText('Email Verified!')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('shows "verified, sign in" against a BE from before the change (no data)', async () => {
    window.location.hash = '#token=abc';
    verifyEmail.mockResolvedValue({ success: true, message: 'Email verified successfully.' });
    renderAt('/verify-email', <VerifyEmailPage />);

    expect(await screen.findByText('Email Verified!')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  const seedPending = (email: string) =>
    window.sessionStorage.setItem(
      'odly.pendingSignup',
      JSON.stringify({ email, mailLeft: true, workspaceName: 'Acme', renewedAt: Date.now() })
    );

  it("verifying THIS tab's signup (signed in) forgets its waiting screen", async () => {
    seedPending('ann@acme.test');
    window.location.hash = '#token=abc';
    verifyEmail.mockResolvedValue({ success: true, data: { signedIn: true, user } });
    renderAt('/verify-email', <VerifyEmailPage />);
    expect(await screen.findByText('DASHBOARD')).toBeInTheDocument();
    expect(window.sessionStorage.getItem('odly.pendingSignup')).toBeNull();
  });

  it("verifying ANOTHER signup's link in this tab leaves this tab's waiting screen alone", async () => {
    seedPending('bob@acme.test');
    window.location.hash = '#token=abc';
    verifyEmail.mockResolvedValue({ success: true, data: { signedIn: true, user } });
    renderAt('/verify-email', <VerifyEmailPage />);
    expect(await screen.findByText('DASHBOARD')).toBeInTheDocument();
    expect(window.sessionStorage.getItem('odly.pendingSignup')).not.toBeNull();
  });

  it('a verification that names nobody (other browser) leaves the waiting screen to correct itself', async () => {
    seedPending('ann@acme.test');
    window.location.hash = '#token=abc';
    verifyEmail.mockResolvedValue({ success: true, data: { signedIn: false } });
    renderAt('/verify-email', <VerifyEmailPage />);
    expect(await screen.findByText('Email Verified!')).toBeInTheDocument();
    expect(window.sessionStorage.getItem('odly.pendingSignup')).not.toBeNull();
  });

  it('posts a single-use token once even when the effect runs twice (StrictMode)', async () => {
    window.location.hash = '#token=abc';
    verifyEmail.mockResolvedValueOnce({ success: true, data: { signedIn: false } });
    verifyEmail.mockImplementation(() => Promise.reject(new Error('400 used')));
    const { StrictMode } = await import('react');
    render(
      <StrictMode>
        <MemoryRouter future={ROUTER_FUTURE} initialEntries={['/verify-email']}>
          <Routes>
            <Route path="/verify-email" element={<VerifyEmailPage />} />
          </Routes>
        </MemoryRouter>
      </StrictMode>
    );

    expect(await screen.findByText('Email Verified!')).toBeInTheDocument();
    expect(verifyEmail).toHaveBeenCalledTimes(1);
  });
});
