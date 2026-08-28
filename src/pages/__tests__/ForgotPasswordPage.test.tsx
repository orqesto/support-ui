/**
 * "Send reset link" did nothing on every deployment without Turnstile configured.
 *
 * Without a site key the widget renders nothing, so `onSuccess` never fires and the
 * token stays null — while this page (alone in the app) both hard-returned on a
 * missing token and disabled its own submit button. The request never left the
 * browser: zero password-reset log lines reached the backend in fourteen days,
 * against an endpoint that answers 200 when called directly.
 *
 * LoginPage passes `captchaToken ?? undefined` and never blocks, which is exactly
 * why login worked and this did not.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ROUTER_FUTURE } from '@/test/routerFuture';
import { afterEach, describe, expect, it, vi } from 'vitest';

const forgotPassword = vi.fn();
let turnstileConfigured = false;

vi.mock('@/services/auth.service', () => ({
  authService: {
    forgotPassword: (...args: unknown[]) => forgotPassword(...args) as unknown,
  },
}));

// Mirrors the real component: renders nothing when no site key is configured, so
// `onSuccess` can never fire and no token is ever produced.
vi.mock('@/components/common/Turnstile', () => ({
  Turnstile: () => null,
  isTurnstileConfigured: () => turnstileConfigured,
}));

const { ForgotPasswordPage } = await import('@/pages/ForgotPasswordPage');

const renderPage = () =>
  render(
    <MemoryRouter future={ROUTER_FUTURE}>
      <ForgotPasswordPage />
    </MemoryRouter>
  );

afterEach(() => {
  cleanup();
  forgotPassword.mockReset();
  turnstileConfigured = false;
});

describe('ForgotPasswordPage', () => {
  it('sends the request when no captcha widget is configured', async () => {
    forgotPassword.mockResolvedValue({ success: true });
    renderPage();

    fireEvent.change(screen.getByPlaceholderText('your.email@example.com'), {
      target: { value: 'someone@example.com' },
    });

    const submit = screen.getByRole('button', { name: /Send reset link/i });
    expect(submit).not.toBeDisabled();

    fireEvent.click(submit);
    await waitFor(() => expect(forgotPassword).toHaveBeenCalled());
    expect(forgotPassword).toHaveBeenCalledWith('someone@example.com', undefined);
  });

  it('still requires a token when a widget IS configured', () => {
    // The protection must survive where it can actually work — this is not a
    // blanket removal of the captcha.
    turnstileConfigured = true;
    renderPage();

    fireEvent.change(screen.getByPlaceholderText('your.email@example.com'), {
      target: { value: 'someone@example.com' },
    });
    expect(screen.getByRole('button', { name: /Send reset link/i })).toBeDisabled();
    expect(forgotPassword).not.toHaveBeenCalled();
  });

  it('still refuses an invalid address', async () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText('your.email@example.com'), {
      target: { value: 'not-an-email' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Send reset link/i }));

    // The assertion that matters: a malformed address must not reach the API.
    await waitFor(() => expect(forgotPassword).not.toHaveBeenCalled());
  });
});
