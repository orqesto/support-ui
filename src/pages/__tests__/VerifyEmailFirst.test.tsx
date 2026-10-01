/**
 * Verify email first (2026-10-01). Signup no longer signs in: the page turns into "check your
 * inbox", and the emailed link signs in only the browser that signed up. Both pages must also
 * keep working against a BE from before the change (FE can reach prod first).
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ROUTER_FUTURE } from '@/test/routerFuture';
import { afterEach, describe, expect, it, vi } from 'vitest';

const signup = vi.fn();
const verifyEmail = vi.fn();
const resendVerification = vi.fn();
const login = vi.fn();
const setSelectedOrganization = vi.fn();

vi.mock('@/services/auth.service', () => ({
  authService: {
    signup: (...args: unknown[]) => signup(...args) as unknown,
    verifyEmail: (...args: unknown[]) => verifyEmail(...args) as unknown,
    resendVerification: (...args: unknown[]) => resendVerification(...args) as unknown,
  },
}));

vi.mock('@/components/common/Turnstile', () => ({
  Turnstile: () => null,
  isTurnstileConfigured: () => false,
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (state: unknown) => unknown) => select({ login, setSelectedOrganization }),
}));

const { CreateWorkspacePage } = await import('@/pages/CreateWorkspacePage');
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

const fillAndSubmit = (email = 'ann@acme.test') => {
  fireEvent.change(screen.getByLabelText('Workspace name'), { target: { value: 'Acme' } });
  fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Ann' } });
  fireEvent.change(screen.getByLabelText('Work email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Secret123' } });
  fireEvent.click(screen.getByRole('button', { name: /Create workspace/i }));
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.location.hash = '';
});

describe('CreateWorkspacePage — verify first', () => {
  it('shows "check your inbox" and does not sign in when the BE asks for verification', async () => {
    signup.mockResolvedValue({
      success: true,
      data: {
        verificationRequired: true,
        email: 'ann@acme.test',
        organization: { id: 40, slug: 'acme', name: 'Acme' },
        onboarding: { status: 'pending', currentStep: 1 },
      },
    });
    renderAt('/signup', <CreateWorkspacePage />);
    fillAndSubmit();

    expect(await screen.findByText('Check your inbox')).toBeInTheDocument();
    expect(screen.getByText('ann@acme.test')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
    expect(screen.queryByText('DASHBOARD')).not.toBeInTheDocument();
  });

  it('resends to the signup address and says so', async () => {
    signup.mockResolvedValue({
      success: true,
      data: {
        verificationRequired: true,
        email: 'ann@acme.test',
        organization: { id: 40, slug: 'acme', name: 'Acme' },
        onboarding: { status: 'pending', currentStep: 1 },
      },
    });
    resendVerification.mockResolvedValue({ success: true });
    renderAt('/signup', <CreateWorkspacePage />);
    // Typed in mixed case; the BE stored (and answered) it lowercased — resend that one.
    fillAndSubmit('Ann@Acme.TEST');
    fireEvent.click(await screen.findByRole('button', { name: /Resend email/i }));

    await waitFor(() => expect(resendVerification).toHaveBeenCalledWith('ann@acme.test'));
    expect(await screen.findByText(/Sent again/)).toBeInTheDocument();
  });

  it('says so when the resend fails', async () => {
    signup.mockResolvedValue({
      success: true,
      data: {
        verificationRequired: true,
        email: 'ann@acme.test',
        organization: { id: 40, slug: 'acme', name: 'Acme' },
        onboarding: { status: 'pending', currentStep: 1 },
      },
    });
    resendVerification.mockImplementation(() => Promise.reject(new Error('429')));
    renderAt('/signup', <CreateWorkspacePage />);
    fillAndSubmit();
    fireEvent.click(await screen.findByRole('button', { name: /Resend email/i }));

    expect(await screen.findByText(/Could not resend/)).toBeInTheDocument();
  });

  it('still signs in against a BE from before the change (answers with user)', async () => {
    signup.mockResolvedValue({
      success: true,
      data: {
        user,
        organization: { id: 40, slug: 'acme', name: 'Acme' },
        onboarding: { status: 'pending', currentStep: 1 },
      },
    });
    renderAt('/signup', <CreateWorkspacePage />);
    fillAndSubmit();

    expect(await screen.findByText('DASHBOARD')).toBeInTheDocument();
    expect(login).toHaveBeenCalledWith(null, user);
    expect(setSelectedOrganization).toHaveBeenCalledWith(40);
  });
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
