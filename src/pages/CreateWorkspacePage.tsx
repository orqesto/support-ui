import { useEffect, useState, useRef, type FormEvent } from 'react';
import { MailCheck } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Turnstile } from '@/components/common/Turnstile';
import type { TurnstileInstance } from '@marsidev/react-turnstile';
import { authService } from '@/services/auth.service';
import { useAuthStore } from '@/stores/authStore';

// Mirror the BE password policy for instant UX feedback (BE re-enforces): at
// least 8 chars, one uppercase letter, one digit.
const PASSWORD_HINT =
  'font-display At least 8 characters, with one uppercase letter and one number. font-medium';
const isPasswordStrong = (password: string) =>
  password.length >= 8 && /[A-Z]/.test(password) && /\d/.test(password);

/**
 * Paid plans the marketing site can preselect via `?plan=` on the signup link.
 * Labels are display-only (for the "you picked X" confirmation); the BE
 * re-validates the slug against its own allowlist and drops anything else, so a
 * hand-edited URL can never break a signup or buy the wrong thing.
 */
const PRESELECTABLE_PLANS: Record<string, string> = {
  starter: 'Starter',
  pro: 'Pro',
};

/**
 * Read the preselected plan once, at mount. Read here rather than in the wizard
 * because this URL does not survive the handoff: signup navigates to /dashboard
 * and Layout then redirects to /onboarding with `replace: true`, dropping the
 * query string. We send it to the BE instead, which stores it on the org so the
 * wizard can read it back from the onboarding status it already fetches.
 */
const readPreselectedPlan = (): string | undefined => {
  const plan = new URLSearchParams(window.location.search).get('plan');
  return plan && plan in PRESELECTABLE_PLANS ? plan : undefined;
};

/**
 * Public self-serve "create a workspace" signup. Distinct from the invite-only
 * accept-invitation flow (SignupPage). Signup does NOT sign in (2026-10-01): the
 * page turns into "check your inbox", and the emailed link signs this browser in
 * and opens the onboarding wizard (VerifyEmailPage). A BE from before that change
 * still answers with `user` and a session cookie — then we hand off to /dashboard
 * as before, so this page works whichever side deploys first.
 */
export const CreateWorkspacePage = () => {
  const [formData, setFormData] = useState({
    workspaceName: '',
    firstName: '',
    lastName: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [emailExists, setEmailExists] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance>(null);
  const [selectedPlan] = useState<string | undefined>(readPreselectedPlan);
  // Set once signup succeeds and the BE wants the address verified first.
  const [sentTo, setSentTo] = useState<string | null>(null);
  // False when the BE could not send the mail (it still created the workspace).
  const [mailLeft, setMailLeft] = useState(true);
  const [resendState, setResendState] = useState<
    'idle' | 'sending' | 'sent' | 'failed' | 'verified'
  >('idle');
  const [pendingNotice, setPendingNotice] = useState('');
  const [editingEmail, setEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [changeError, setChangeError] = useState('');
  const [isChanging, setIsChanging] = useState(false);
  const inboxHeadingRef = useRef<HTMLDivElement>(null);

  const login = useAuthStore((state) => state.login);
  const setSelectedOrganization = useAuthStore((state) => state.setSelectedOrganization);
  const navigate = useNavigate();

  const resetCaptcha = () => {
    turnstileRef.current?.reset();
    setCaptchaToken(null);
  };

  const handleChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError('');
    setEmailExists(false);
  };

  const validateForm = (): string | null => {
    if (!formData.workspaceName.trim() || !formData.firstName.trim() || !formData.email.trim()) {
      return 'Please fill in all required fields';
    }
    if (formData.workspaceName.trim().length < 2) {
      return 'Workspace name must be at least 2 characters long';
    }
    if (!isPasswordStrong(formData.password)) {
      return PASSWORD_HINT;
    }
    return null;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setEmailExists(false);

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsLoading(true);
    try {
      const response = await authService.signup({
        workspaceName: formData.workspaceName.trim(),
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim() || undefined,
        email: formData.email.trim(),
        password: formData.password,
        captchaToken: captchaToken ?? undefined,
        plan: selectedPlan,
      });

      if (response.success && response.data?.verificationRequired) {
        setSentTo(response.data.email);
        setMailLeft(response.data.emailSent !== false);
        return;
      }

      if (response.success && response.data?.user) {
        // A BE from before verify-first: it already set the httpOnly jwt cookie.
        // Mirror the password-login store writes (token stays null — cookie-based
        // auth), then hand off to /dashboard which routes a fresh pending org into
        // the onboarding wizard.
        login(null, response.data.user);
        setSelectedOrganization(response.data.organization.id);
        navigate('/dashboard');
        return;
      }

      setError(response.message ?? response.error ?? 'Could not create your workspace.');
      resetCaptcha();
    } catch (err) {
      const status = (err as { status?: number } | null)?.status;
      const serverMessage = (err as { data?: { error?: string } } | null)?.data?.error ?? '';
      // Two different 409s: the address has an account, or the workspace NAME is taken. Only the
      // first means "sign in instead" — the second needs a different name.
      if (status === 409 && /workspace/i.test(serverMessage)) {
        setError(serverMessage);
      } else if (status === 409) {
        setEmailExists(true);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An error occurred while creating your workspace.');
      }
      resetCaptcha();
    } finally {
      setIsLoading(false);
    }
  };

  // The screen swaps under the user; move focus to its heading so keyboard and screen-reader
  // users land on "Check your inbox" rather than on a button that no longer exists.
  useEffect(() => {
    if (sentTo) inboxHeadingRef.current?.focus();
  }, [sentTo]);

  /** "already verified" (409) is not a failure: the address is done, the user signs in. */
  const pendingFailureMessage = (err: unknown, fallback: string) => {
    const failure = err as { status?: number; data?: { error?: string } } | null;
    // 429 carries the real wait (the limiter is per hour) — never invent a shorter one.
    if ([400, 409, 429].includes(failure?.status ?? 0)) return failure?.data?.error ?? fallback;
    if (failure?.status === 401) {
      return 'This browser no longer holds your sign-up. Sign in — the login page can resend the email.';
    }
    return fallback;
  };

  const handleResend = async () => {
    setResendState('sending');
    setPendingNotice('');
    try {
      const response = await authService.resendPendingSignup();
      if (response.data) {
        setSentTo(response.data.email);
        setMailLeft(response.data.emailSent);
      }
      setResendState(response.data?.emailSent === false ? 'failed' : 'sent');
    } catch (err) {
      const verified = (err as { status?: number } | null)?.status === 409;
      setResendState(verified ? 'verified' : 'failed');
      setPendingNotice(pendingFailureMessage(err, ''));
    }
  };

  const handleChangeEmail = async (event: FormEvent) => {
    event.preventDefault();
    setChangeError('');
    setIsChanging(true);
    try {
      const response = await authService.changePendingSignupEmail(newEmail.trim());
      if (response.data) {
        setSentTo(response.data.email);
        setMailLeft(response.data.emailSent);
      }
      setEditingEmail(false);
      setResendState('idle');
      setPendingNotice('');
    } catch (err) {
      setChangeError(pendingFailureMessage(err, 'Could not change the address. Please try again.'));
    } finally {
      setIsChanging(false);
    }
  };

  if (sentTo) {
    return (
      <div className="flex justify-center items-center px-4 min-h-screen bg-background">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1">
            <MailCheck className="w-8 h-8 text-primary" aria-hidden="true" />
            <div ref={inboxHeadingRef} tabIndex={-1} className="outline-none">
              <CardTitle className="text-2xl">
                {mailLeft ? 'Check your inbox' : 'We could not send the email'}
              </CardTitle>
            </div>
            <CardDescription>
              {mailLeft ? 'We sent a verification link to ' : 'Your workspace is ready, but the link to '}
              <span className="font-medium text-foreground break-all">{sentTo}</span>
              {mailLeft
                ? `. Open it in this browser to set up ${formData.workspaceName.trim() || 'your workspace'}.`
                : ' did not go out. Press "Resend email" to try again.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              The link works for 24 hours, and each new email replaces the previous link — use the
              newest one. Opened on another device, it verifies your email and asks you to sign in.
            </p>
            {resendState === 'sent' && (
              <Alert variant="success">
                Sent again. Check your spam folder if it does not arrive in a few minutes.
              </Alert>
            )}
            {resendState === 'verified' && (
              <Alert variant="info">
                This email is already verified.{' '}
                <Link to="/login" className="font-medium underline">
                  Sign in
                </Link>
                .
              </Alert>
            )}
            {resendState === 'failed' && (
              <Alert variant="danger">
                {pendingNotice || 'Could not resend the email. Please try again later.'}
              </Alert>
            )}
            <Button
              type="button"
              variant="outline"
              className="w-full"
              isLoading={resendState === 'sending'}
              onClick={() => void handleResend()}
            >
              Resend email
            </Button>
            {editingEmail ? (
              <form onSubmit={handleChangeEmail} className="space-y-3">
                <Input
                  label="Correct email address"
                  type="email"
                  autoComplete="email"
                  value={newEmail}
                  onChange={(event) => setNewEmail(event.target.value)}
                  required
                />
                {changeError && <Alert variant="danger">{changeError}</Alert>}
                <div className="flex gap-2">
                  <Button type="submit" className="flex-1" isLoading={isChanging}>
                    Send to this address
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setEditingEmail(false);
                      setChangeError('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setNewEmail(sentTo);
                  setEditingEmail(true);
                }}
              >
                Wrong address? Change it
              </Button>
            )}
            <div className="text-sm text-center text-muted-foreground">
              Already verified?{' '}
              <Link to="/login" className="font-medium text-primary hover:underline">
                Sign in
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex justify-center items-center px-4 min-h-screen bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">Start your free trial</CardTitle>
          <CardDescription>
            Create a workspace and start your 14-day trial. No credit card required.
          </CardDescription>
          {/* Confirms the plan picked on the marketing site actually carried
              over — without it the handoff is invisible and the payment step
              later in onboarding would come out of nowhere. */}
          {selectedPlan && (
            <div className="flex gap-2 items-center pt-1">
              <Badge variant="secondary">{PRESELECTABLE_PLANS[selectedPlan]} plan</Badge>
              <span className="text-xs text-muted-foreground">
                selected — you won&apos;t be charged during the trial
              </span>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Workspace name"
              type="text"
              placeholder="Arasaka"
              value={formData.workspaceName}
              onChange={(event) => handleChange('workspaceName', event.target.value)}
              required
            />

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="First name"
                type="text"
                placeholder="John"
                value={formData.firstName}
                onChange={(event) => handleChange('firstName', event.target.value)}
                required
              />
              <Input
                label="Last name (optional)"
                type="text"
                placeholder="Doe"
                value={formData.lastName}
                onChange={(event) => handleChange('lastName', event.target.value)}
              />
            </div>

            <Input
              label="Work email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={formData.email}
              onChange={(event) => handleChange('email', event.target.value)}
              required
            />

            <PasswordInput
              label="Password"
              autoComplete="new-password"
              placeholder="Create a password"
              value={formData.password}
              onChange={(event) => handleChange('password', event.target.value)}
              required
            />

            {emailExists && (
              <div className="p-3 text-sm rounded-md text-destructive bg-destructive/10">
                An account with this email already exists.{' '}
                <Link to="/login" className="font-medium underline">
                  Sign in instead
                </Link>
                .
              </div>
            )}
            {error && !emailExists && (
              <div className="p-3 text-sm rounded-md text-destructive bg-destructive/10">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" isLoading={isLoading}>
              Create workspace
            </Button>

            <div className="py-2 text-sm text-center text-muted-foreground">
              Already have an account?{' '}
              <Link to="/login" className="font-medium text-primary hover:underline">
                Sign in
              </Link>
            </div>
          </form>
        </CardContent>
        <div className="flex justify-center">
          <Turnstile
            ref={turnstileRef}
            onSuccess={(token) => setCaptchaToken(token)}
            onError={() => setError('Security check failed. Please try again.')}
          />
        </div>
      </Card>
    </div>
  );
};
