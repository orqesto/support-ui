/**
 * Verify email first (2026-10-01). Signup no longer signs in: the page turns into "check your
 * inbox", and the emailed link signs in only the browser that signed up. Both pages must also
 * keep working against a BE from before the change (FE can reach prod first).
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    resendPendingSignup.mockResolvedValue({
      success: true,
      data: { email: 'ann@acme.test', emailSent: true },
    });
    renderAt('/signup', <CreateWorkspacePage />);
    fillAndSubmit('Ann@Acme.TEST');
    fireEvent.click(await screen.findByRole('button', { name: /Resend email/i }));

    // Same-browser resend: no address in the request, so it cannot target another account.
    await waitFor(() => expect(resendPendingSignup).toHaveBeenCalledWith());
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
    resendPendingSignup.mockImplementation(() => Promise.reject(new Error('429')));
    renderAt('/signup', <CreateWorkspacePage />);
    fillAndSubmit();
    fireEvent.click(await screen.findByRole('button', { name: /Resend email/i }));

    expect(await screen.findByText(/Could not resend/)).toBeInTheDocument();
    expect(screen.queryByText(/in a minute/)).not.toBeInTheDocument();
  });

  const inboxResponse = (extra: Record<string, unknown> = {}) => ({
    success: true,
    data: {
      verificationRequired: true,
      email: 'ann@acme.test',
      organization: { id: 40, slug: 'acme', name: 'Acme' },
      onboarding: { status: 'pending', currentStep: 1 },
      ...extra,
    },
  });

  it('moves focus to the new heading when the screen swaps', async () => {
    signup.mockResolvedValue(inboxResponse());
    renderAt('/signup', <CreateWorkspacePage />);
    fillAndSubmit();
    const heading = await screen.findByText('Check your inbox');
    await waitFor(() => expect(heading.parentElement).toHaveFocus());
  });

  it('does not claim a mail was sent when the BE could not send it', async () => {
    signup.mockResolvedValue(inboxResponse({ emailSent: false }));
    renderAt('/signup', <CreateWorkspacePage />);
    fillAndSubmit();
    expect(await screen.findByText('We could not send the email')).toBeInTheDocument();
    expect(screen.queryByText('Check your inbox')).not.toBeInTheDocument();
  });

  it('a rate-limited resend shows the real wait, not an invented one', async () => {
    signup.mockResolvedValue(inboxResponse());
    resendPendingSignup.mockImplementation(() =>
      Promise.reject(
        Object.assign(new Error('429'), {
          status: 429,
          data: { error: 'Too many verification email requests. Please try again in an hour.' },
        })
      )
    );
    renderAt('/signup', <CreateWorkspacePage />);
    fillAndSubmit();
    fireEvent.click(await screen.findByRole('button', { name: /Resend email/i }));
    expect(await screen.findByText(/try again in an hour/)).toBeInTheDocument();
    expect(screen.queryByText(/in a minute/)).not.toBeInTheDocument();
  });

  it('a resend answered "already verified" says sign in, not "could not resend"', async () => {
    signup.mockResolvedValue(inboxResponse());
    resendPendingSignup.mockImplementation(() =>
      Promise.reject(
        Object.assign(new Error('409'), {
          status: 409,
          data: { error: 'This email is already verified. Please sign in.' },
        })
      )
    );
    renderAt('/signup', <CreateWorkspacePage />);
    fillAndSubmit();
    fireEvent.click(await screen.findByRole('button', { name: /Resend email/i }));
    const notice = (await screen.findByText(/This email is already verified/)).closest(
      '[role="alert"]'
    ) as HTMLElement;
    // A neutral notice that carries its own way forward — not the red "failed" alert.
    expect(within(notice).getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    expect(notice.className).not.toMatch(/destructive/);
    expect(screen.queryByText(/Could not resend/)).not.toBeInTheDocument();
  });

  it('corrects a mistyped address and shows the new one', async () => {
    signup.mockResolvedValue(inboxResponse({ email: 'ann@acme.tset' }));
    changePendingSignupEmail.mockResolvedValue({
      success: true,
      data: { email: 'ann@acme.test', emailSent: true },
    });
    renderAt('/signup', <CreateWorkspacePage />);
    fillAndSubmit('ann@acme.tset');
    fireEvent.click(await screen.findByRole('button', { name: /Wrong address/i }));
    fireEvent.change(screen.getByLabelText('Correct email address'), {
      target: { value: 'ann@acme.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Send to this address/i }));

    await waitFor(() => expect(changePendingSignupEmail).toHaveBeenCalledWith('ann@acme.test'));
    expect(await screen.findByText('ann@acme.test')).toBeInTheDocument();
    expect(screen.queryByText('ann@acme.tset')).not.toBeInTheDocument();
  });

  it('shows why a correction was refused (address taken)', async () => {
    signup.mockResolvedValue(inboxResponse());
    changePendingSignupEmail.mockImplementation(() =>
      Promise.reject(
        Object.assign(new Error('409'), {
          status: 409,
          data: { error: 'An account with this email already exists' },
        })
      )
    );
    renderAt('/signup', <CreateWorkspacePage />);
    fillAndSubmit();
    fireEvent.click(await screen.findByRole('button', { name: /Wrong address/i }));
    fireEvent.change(screen.getByLabelText('Correct email address'), {
      target: { value: 'bob@acme.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Send to this address/i }));
    expect(await screen.findByText('An account with this email already exists')).toBeInTheDocument();
    expect(screen.getByText('ann@acme.test')).toBeInTheDocument();
  });

  it('a taken workspace NAME is not reported as "email already exists"', async () => {
    signup.mockImplementation(() =>
      Promise.reject(
        Object.assign(new Error('409'), {
          status: 409,
          data: {
            error: 'A workspace with this name already exists. Please choose a different name.',
          },
        })
      )
    );
    renderAt('/signup', <CreateWorkspacePage />);
    fillAndSubmit();
    expect(await screen.findByText(/A workspace with this name already exists/)).toBeInTheDocument();
    expect(screen.queryByText(/An account with this email already exists/)).not.toBeInTheDocument();
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
