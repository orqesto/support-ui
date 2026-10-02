/**
 * Verify email first (2026-10-01). Signup no longer signs in: the page turns into "check your
 * inbox", and the emailed link signs in only the browser that signed up. Both pages must also
 * keep working against a BE from before the change (FE can reach prod first).
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  window.sessionStorage.clear();
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
    // No removal promise unless the BE says this deployment removes unverified signups.
    expect(screen.queryByText(/is removed/)).not.toBeInTheDocument();
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

    // Same-browser resend, naming the address THIS tab shows (the BE lowercased it).
    await waitFor(() => expect(resendPendingSignup).toHaveBeenCalledWith('ann@acme.test'));
    expect(await screen.findByText(/^Sent\./)).toBeInTheDocument();
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

  it('states the removal window the BE reports, in its number', async () => {
    signup.mockResolvedValue(inboxResponse({ abandonedAfterDays: 9 }));
    renderAt('/signup', <CreateWorkspacePage />);
    fillAndSubmit();
    expect(await screen.findByText(/not verified within 9 days is removed/)).toBeInTheDocument();
  });

  it('does not claim a mail was sent when the BE could not send it', async () => {
    signup.mockResolvedValue(inboxResponse({ emailSent: false }));
    renderAt('/signup', <CreateWorkspacePage />);
    fillAndSubmit();
    expect(await screen.findByText('We could not send the email')).toBeInTheDocument();
    expect(screen.queryByText('Check your inbox')).not.toBeInTheDocument();
    // No link went out, so nothing may describe one.
    expect(screen.queryByText(/The link works for 24 hours/)).not.toBeInTheDocument();
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
    // Nothing on the waiting screen is true any more: it gives way to "Already verified".
    expect(await screen.findByText('Already verified')).toBeInTheDocument();
    expect(screen.queryByText('Check your inbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Resend email/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Could not resend/)).not.toBeInTheDocument();
  });

  const rejectWith = (status: number, error: string) => () =>
    Promise.reject(Object.assign(new Error(String(status)), { status, data: { error } }));

  it('a stale tab (newer signup in this browser) is told so, not "already verified"', async () => {
    signup.mockResolvedValue(inboxResponse());
    resendPendingSignup.mockImplementation(
      rejectWith(
        409,
        'This browser has started a newer sign-up since. Continue in the newest tab, or sign in.'
      )
    );
    renderAt('/signup', <CreateWorkspacePage />);
    fillAndSubmit();
    fireEvent.click(await screen.findByRole('button', { name: /Resend email/i }));
    expect(await screen.findByText(/started a newer sign-up/)).toBeInTheDocument();
    expect(screen.queryByText('Already verified')).not.toBeInTheDocument();
  });

  it('a signup that no longer exists says to sign up again, not "try again"', async () => {
    signup.mockResolvedValue(inboxResponse());
    resendPendingSignup.mockImplementation(
      rejectWith(404, 'This sign-up no longer exists. Please sign up again.')
    );
    renderAt('/signup', <CreateWorkspacePage />);
    fillAndSubmit();
    fireEvent.click(await screen.findByRole('button', { name: /Resend email/i }));
    expect(await screen.findByText(/no longer exists/)).toBeInTheDocument();
    expect(screen.queryByText(/try again later/)).not.toBeInTheDocument();
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

    await waitFor(() =>
      expect(changePendingSignupEmail).toHaveBeenCalledWith('ann@acme.test', 'ann@acme.tset')
    );
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
    expect(
      await screen.findByText('An account with this email already exists')
    ).toBeInTheDocument();
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
    expect(
      await screen.findByText(/A workspace with this name already exists/)
    ).toBeInTheDocument();
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

describe('CreateWorkspacePage — the waiting screen survives a reload', () => {
  const seed = (value: Record<string, unknown>) =>
    window.sessionStorage.setItem('odly.pendingSignup', JSON.stringify(value));

  it('a reload (or a discarded mobile tab) comes back to "check your inbox", not the empty form', async () => {
    signup.mockResolvedValue({
      success: true,
      data: {
        verificationRequired: true,
        email: 'ann@acme.test',
        emailSent: true,
        abandonedAfterDays: 7,
        organization: { id: 40, slug: 'acme', name: 'Acme' },
        onboarding: { status: 'pending', currentStep: 1 },
      },
    });
    const first = renderAt('/signup', <CreateWorkspacePage />);
    fillAndSubmit();
    expect(await screen.findByText('Check your inbox')).toBeInTheDocument();
    first.unmount();

    renderAt('/signup', <CreateWorkspacePage />);
    expect(screen.getByText('Check your inbox')).toBeInTheDocument();
    expect(screen.getByText('ann@acme.test')).toBeInTheDocument();
    expect(screen.getByText(/set up Acme/)).toBeInTheDocument();
    expect(screen.getByText(/within 7 days is removed/)).toBeInTheDocument();
    // ...and the correction still works from there.
    expect(screen.getByRole('button', { name: /Wrong address/i })).toBeInTheDocument();
  });

  it('an entry older than the 24-hour cookie is ignored', () => {
    seed({
      email: 'ann@acme.test',
      mailLeft: true,
      workspaceName: 'Acme',
      renewedAt: Date.now() - 25 * 60 * 60 * 1000,
    });
    renderAt('/signup', <CreateWorkspacePage />);
    expect(screen.queryByText('Check your inbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create workspace/i })).toBeInTheDocument();
  });

  it('a corrupt entry is ignored', () => {
    window.sessionStorage.setItem('odly.pendingSignup', '{not json');
    renderAt('/signup', <CreateWorkspacePage />);
    expect(screen.getByRole('button', { name: /Create workspace/i })).toBeInTheDocument();
  });

  it('"Start a different sign-up" goes back to the form and forgets the waiting screen', async () => {
    seed({ email: 'ann@acme.test', mailLeft: true, workspaceName: 'Acme', renewedAt: Date.now() });
    renderAt('/signup', <CreateWorkspacePage />);
    fireEvent.click(screen.getByRole('button', { name: /Start a different sign-up/i }));
    expect(await screen.findByRole('button', { name: /Create workspace/i })).toBeInTheDocument();
    expect(window.sessionStorage.getItem('odly.pendingSignup')).toBeNull();
  });

  const restoreAndResend = (status: number, error: string) => {
    seed({ email: 'ann@acme.test', mailLeft: true, workspaceName: 'Acme', renewedAt: Date.now() });
    resendPendingSignup.mockImplementation(() =>
      Promise.reject(Object.assign(new Error(String(status)), { status, data: { error } }))
    );
    renderAt('/signup', <CreateWorkspacePage />);
    fireEvent.click(screen.getByRole('button', { name: /Resend email/i }));
  };

  it('a tab made stale by a newer signup in this browser is forgotten', async () => {
    restoreAndResend(
      409,
      'This browser has started a newer sign-up since. Continue in the newest tab, or sign in.'
    );
    expect(await screen.findByText(/can.t continue here/)).toBeInTheDocument();
    expect(screen.getByText(/newer sign-up/)).toBeInTheDocument();
    // The waiting screen's promises are gone with it.
    expect(screen.queryByText('Check your inbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Resend email/i })).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem('odly.pendingSignup')).toBeNull();
  });

  it('a browser that no longer holds the signup (401) is forgotten', async () => {
    restoreAndResend(401, 'This browser has no sign-up waiting for verification.');
    // The usual 401: the link was opened in another tab, which verified and signed this browser in.
    expect(
      await screen.findByText(/If you opened the link, your email is verified/)
    ).toBeInTheDocument();
    expect(screen.getByText(/can.t continue here/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(window.sessionStorage.getItem('odly.pendingSignup')).toBeNull();
  });

  it('an address verified meanwhile is forgotten (the verified screen replaces it)', async () => {
    restoreAndResend(409, 'This email is already verified. Please sign in.');
    expect(await screen.findByText('Already verified')).toBeInTheDocument();
    await waitFor(() => expect(window.sessionStorage.getItem('odly.pendingSignup')).toBeNull());
  });

  it('a taken address on correction keeps the waiting screen (the user tries another)', async () => {
    seed({ email: 'ann@acme.test', mailLeft: true, workspaceName: 'Acme', renewedAt: Date.now() });
    changePendingSignupEmail.mockImplementation(() =>
      Promise.reject(
        Object.assign(new Error('409'), {
          status: 409,
          data: { error: 'An account with this email already exists' },
        })
      )
    );
    renderAt('/signup', <CreateWorkspacePage />);
    fireEvent.click(screen.getByRole('button', { name: /Wrong address/i }));
    fireEvent.change(screen.getByLabelText('Correct email address'), {
      target: { value: 'bob@acme.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Send to this address/i }));
    expect(
      await screen.findByText('An account with this email already exists')
    ).toBeInTheDocument();
    expect(window.sessionStorage.getItem('odly.pendingSignup')).not.toBeNull();
  });

  it('a correction answered "already verified" shows the verified screen and forgets the wait', async () => {
    seed({ email: 'ann@acme.test', mailLeft: true, workspaceName: 'Acme', renewedAt: Date.now() });
    changePendingSignupEmail.mockImplementation(() =>
      Promise.reject(
        Object.assign(new Error('409'), {
          status: 409,
          data: { error: 'This email is already verified. Please sign in.' },
        })
      )
    );
    renderAt('/signup', <CreateWorkspacePage />);
    fireEvent.click(screen.getByRole('button', { name: /Wrong address/i }));
    fireEvent.change(screen.getByLabelText('Correct email address'), {
      target: { value: 'bob@acme.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Send to this address/i }));
    expect(await screen.findByText('Already verified')).toBeInTheDocument();
    // The verified address is the OLD one, and it is the one named.
    expect(screen.getByText('ann@acme.test')).toBeInTheDocument();
    await waitFor(() => expect(window.sessionStorage.getItem('odly.pendingSignup')).toBeNull());
  });

  it('"Start a different sign-up" after a live signup empties every field', async () => {
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
    fireEvent.click(await screen.findByRole('button', { name: /Start a different sign-up/i }));
    await screen.findByRole('button', { name: /Create workspace/i });
    for (const label of ['Workspace name', 'First name', 'Work email', 'Password']) {
      expect(screen.getByLabelText(label)).toHaveValue('');
    }
  });

  it('a signup that no longer exists offers only a new sign-up (signing in cannot work)', async () => {
    restoreAndResend(404, 'This sign-up no longer exists. Please sign up again.');
    expect(await screen.findByText(/can.t continue here/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Start a different sign-up/i }));
    expect(await screen.findByRole('button', { name: /Create workspace/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Workspace name')).toHaveValue('');
  });

  it('a correction can end the sign-up too (newer signup took over)', async () => {
    seed({ email: 'ann@acme.test', mailLeft: true, workspaceName: 'Acme', renewedAt: Date.now() });
    changePendingSignupEmail.mockImplementation(() =>
      Promise.reject(
        Object.assign(new Error('409'), {
          status: 409,
          data: {
            error:
              'This browser has started a newer sign-up since. Continue in the newest tab, or sign in.',
          },
        })
      )
    );
    renderAt('/signup', <CreateWorkspacePage />);
    fireEvent.click(screen.getByRole('button', { name: /Wrong address/i }));
    fireEvent.change(screen.getByLabelText('Correct email address'), {
      target: { value: 'bob@acme.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Send to this address/i }));
    expect(await screen.findByText(/can.t continue here/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Correct email address')).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem('odly.pendingSignup')).toBeNull();
  });

  it('an answer that arrives after "Start a different sign-up" is ignored', async () => {
    seed({ email: 'ann@acme.test', mailLeft: true, workspaceName: 'Acme', renewedAt: Date.now() });
    let answer: (value: unknown) => void = () => undefined;
    resendPendingSignup.mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        })
    );
    renderAt('/signup', <CreateWorkspacePage />);
    fireEvent.click(screen.getByRole('button', { name: /Resend email/i }));
    fireEvent.click(screen.getByRole('button', { name: /Start a different sign-up/i }));
    await screen.findByRole('button', { name: /Create workspace/i });
    // Flush the late answer inside act(), so a re-render it causes is visible below.
    await act(async () => {
      answer({ success: true, data: { email: 'ann@acme.test', emailSent: true } });
      await Promise.resolve();
    });
    expect(screen.getByRole('button', { name: /Create workspace/i })).toBeInTheDocument();
    expect(screen.queryByText('Check your inbox')).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem('odly.pendingSignup')).toBeNull();
  });

  it('a correction answer that arrives after "Start a different sign-up" is ignored', async () => {
    seed({ email: 'ann@acme.test', mailLeft: true, workspaceName: 'Acme', renewedAt: Date.now() });
    let answer: (value: unknown) => void = () => undefined;
    changePendingSignupEmail.mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        })
    );
    renderAt('/signup', <CreateWorkspacePage />);
    fireEvent.click(screen.getByRole('button', { name: /Wrong address/i }));
    fireEvent.change(screen.getByLabelText('Correct email address'), {
      target: { value: 'bob@acme.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Send to this address/i }));
    fireEvent.click(screen.getByRole('button', { name: /Start a different sign-up/i }));
    await screen.findByRole('button', { name: /Create workspace/i });
    await act(async () => {
      answer({ success: true, data: { email: 'bob@acme.test', emailSent: true } });
      await Promise.resolve();
    });
    expect(screen.queryByText('Check your inbox')).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem('odly.pendingSignup')).toBeNull();
  });

  it('while a resend runs, neither it nor a correction can be sent', () => {
    seed({ email: 'ann@acme.test', mailLeft: true, workspaceName: 'Acme', renewedAt: Date.now() });
    resendPendingSignup.mockImplementation(() => new Promise(() => undefined));
    renderAt('/signup', <CreateWorkspacePage />);
    // A loading button shows only its spinner (no name), so hold the element itself.
    const resend = screen.getByRole('button', { name: /Resend email/i });
    fireEvent.click(resend);
    expect(resend).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Wrong address/i }));
    expect(screen.getByRole('button', { name: /Send to this address/i })).toBeDisabled();
  });

  it('while a correction runs, neither it, a resend, nor Cancel can be used', () => {
    seed({ email: 'ann@acme.test', mailLeft: true, workspaceName: 'Acme', renewedAt: Date.now() });
    changePendingSignupEmail.mockImplementation(() => new Promise(() => undefined));
    renderAt('/signup', <CreateWorkspacePage />);
    fireEvent.click(screen.getByRole('button', { name: /Wrong address/i }));
    fireEvent.change(screen.getByLabelText('Correct email address'), {
      target: { value: 'bob@acme.test' },
    });
    const submit = screen.getByRole('button', { name: /Send to this address/i });
    fireEvent.click(submit);
    expect(submit).toBeDisabled();
    expect(screen.getByRole('button', { name: /Resend email/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('a new signup after an end screen starts clean (no end screen, no old error)', async () => {
    restoreAndResend(404, 'This sign-up no longer exists. Please sign up again.');
    await screen.findByText(/can.t continue here/);
    fireEvent.click(screen.getByRole('button', { name: /Start a different sign-up/i }));
    await screen.findByRole('button', { name: /Create workspace/i });
    signup.mockResolvedValue({
      success: true,
      data: {
        verificationRequired: true,
        email: 'bob@acme.test',
        organization: { id: 41, slug: 'bob', name: 'Bob' },
        onboarding: { status: 'pending', currentStep: 1 },
      },
    });
    fillAndSubmit('bob@acme.test');
    expect(await screen.findByText('Check your inbox')).toBeInTheDocument();
    expect(screen.queryByText(/can.t continue here/)).not.toBeInTheDocument();
    expect(screen.queryByText(/no longer exists/)).not.toBeInTheDocument();
  });

  it('an old correction error does not reappear under a new attempt', async () => {
    seed({ email: 'ann@acme.test', mailLeft: true, workspaceName: 'Acme', renewedAt: Date.now() });
    changePendingSignupEmail.mockImplementation(() =>
      Promise.reject(
        Object.assign(new Error('409'), {
          status: 409,
          data: { error: 'An account with this email already exists' },
        })
      )
    );
    renderAt('/signup', <CreateWorkspacePage />);
    fireEvent.click(screen.getByRole('button', { name: /Wrong address/i }));
    fireEvent.change(screen.getByLabelText('Correct email address'), {
      target: { value: 'bob@acme.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Send to this address/i }));
    await screen.findByText('An account with this email already exists');
    // Leave mid-correction, start a new signup, then correct again: the old error must be gone.
    fireEvent.click(screen.getByRole('button', { name: /Start a different sign-up/i }));
    await screen.findByRole('button', { name: /Create workspace/i });
    signup.mockResolvedValue({
      success: true,
      data: {
        verificationRequired: true,
        email: 'cat@acme.test',
        organization: { id: 42, slug: 'cat', name: 'Cat' },
        onboarding: { status: 'pending', currentStep: 1 },
      },
    });
    fillAndSubmit('cat@acme.test');
    fireEvent.click(await screen.findByRole('button', { name: /Wrong address/i }));
    expect(screen.queryByText('An account with this email already exists')).not.toBeInTheDocument();
  });

  it('"Start a different sign-up" starts from an empty form', async () => {
    seed({ email: 'ann@acme.test', mailLeft: true, workspaceName: 'Acme', renewedAt: Date.now() });
    renderAt('/signup', <CreateWorkspacePage />);
    fireEvent.click(screen.getByRole('button', { name: /Start a different sign-up/i }));
    await screen.findByRole('button', { name: /Create workspace/i });
    expect(screen.getByLabelText('Workspace name')).toHaveValue('');
    expect(screen.getByLabelText('Work email')).toHaveValue('');
  });

  it('a signup that no longer exists is forgotten, so a reload shows the form', async () => {
    seed({ email: 'ann@acme.test', mailLeft: true, workspaceName: 'Acme', renewedAt: Date.now() });
    resendPendingSignup.mockImplementation(() =>
      Promise.reject(
        Object.assign(new Error('404'), {
          status: 404,
          data: { error: 'This sign-up no longer exists. Please sign up again.' },
        })
      )
    );
    renderAt('/signup', <CreateWorkspacePage />);
    fireEvent.click(screen.getByRole('button', { name: /Resend email/i }));
    expect(await screen.findByText(/no longer exists/)).toBeInTheDocument();
    expect(window.sessionStorage.getItem('odly.pendingSignup')).toBeNull();
  });
});
