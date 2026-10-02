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
import { readPendingSignup, writePendingSignup } from '@/lib/pendingSignup';

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
 * because this URL does not survive the handoff: the user reaches the wizard
 * later, from the emailed link (or, on a BE from before verify-first, via
 * /dashboard → /onboarding with `replace: true`), so the query string is gone. We send it to the BE instead, which stores it on the org so the
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
  const [restored] = useState(readPendingSignup);
  const [formData, setFormData] = useState({
    workspaceName: restored?.workspaceName ?? '',
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
  const [sentTo, setSentTo] = useState<string | null>(restored?.email ?? null);
  // When the same-browser cookie was last (re)issued: signup, resend and correction renew it.
  const [renewedAt, setRenewedAt] = useState<number>(restored?.renewedAt ?? 0);
  // False when the BE could not send the mail (it still created the workspace).
  const [mailLeft, setMailLeft] = useState(restored?.mailLeft ?? true);
  // From the BE, never a literal here: null on deployments that never remove a signup.
  const [removedAfterDays, setRemovedAfterDays] = useState<number | null>(
    restored?.removedAfterDays ?? null
  );
  const [resendState, setResendState] = useState<
    'idle' | 'sending' | 'sent' | 'failed' | 'verified'
  >('idle');
  const [pendingNotice, setPendingNotice] = useState('');
  // Set when nothing in this tab can continue (see classifyPendingFailure): the end screen.
  const [ended, setEnded] = useState<{ message: string; canSignIn: boolean } | null>(null);
  // Bumped whenever the screen a request was made for is abandoned (start-over, a new signup): a
  // late answer for the old screen must not land on the new one.
  const generation = useRef(0);
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
        // A new waiting screen: nothing from an earlier one (a late answer, a notice, an end
        // screen, an open correction) may carry over.
        generation.current += 1;
        setEnded(null);
        setResendState('idle');
        setPendingNotice('');
        setEditingEmail(false);
        setChangeError('');
        setSentTo(response.data.email);
        setMailLeft(response.data.emailSent !== false);
        setRemovedAfterDays(response.data.abandonedAfterDays ?? null);
        setRenewedAt(Date.now());
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

  const isVerifiedScreen = resendState === 'verified';
  const isEndedScreen = ended !== null;
  const requestInFlight = isChanging || resendState === 'sending';

  // Keep the waiting screen across a reload while it means something; drop it once it does not.
  useEffect(() => {
    if (sentTo && !isVerifiedScreen && !isEndedScreen) {
      writePendingSignup({
        email: sentTo,
        mailLeft,
        removedAfterDays,
        workspaceName: formData.workspaceName,
        renewedAt,
      });
    } else {
      writePendingSignup(null);
    }
  }, [
    sentTo,
    isVerifiedScreen,
    isEndedScreen,
    mailLeft,
    removedAfterDays,
    formData.workspaceName,
    renewedAt,
  ]);

  // The screen swaps under the user; move focus to its heading so keyboard and screen-reader
  // users land on the new heading rather than on a button that no longer exists.
  useEffect(() => {
    if (sentTo) inboxHeadingRef.current?.focus();
  }, [sentTo, isVerifiedScreen, isEndedScreen]);

  /**
   * Every failure of resend / correction is one of three outcomes, decided in ONE place so the two
   * buttons cannot disagree:
   * - verified: the address was verified meanwhile — the verified screen;
   * - ended: nothing in this tab can continue (the signup is gone — 404; this browser no longer
   *   holds it — 401; a newer signup in this browser took over its cookie — 409 "newer") — the
   *   end screen, and the saved waiting screen is forgotten;
   * - retry: anything else (address taken, invalid, rate-limited with its real wait, a network
   *   error) — the message, and the waiting screen stays.
   */
  type PendingFailure =
    | { kind: 'verified' }
    | { kind: 'ended'; message: string; canSignIn: boolean }
    | { kind: 'retry'; message: string };
  const classifyPendingFailure = (err: unknown, fallback: string): PendingFailure => {
    const failure = err as { status?: number; data?: { error?: string } } | null;
    const text = failure?.data?.error ?? '';
    if (failure?.status === 409 && /already verified/i.test(text)) return { kind: 'verified' };
    if (failure?.status === 404) {
      // The account is gone too: signing in cannot work, so it is not offered.
      return {
        kind: 'ended',
        message: text || 'This sign-up no longer exists. Please sign up again.',
        canSignIn: false,
      };
    }
    if (failure?.status === 401) {
      // This browser no longer holds the signup's cookie. The usual reason is the good one: the
      // link was opened (in another tab), which verified the address and signed this browser in.
      return {
        kind: 'ended',
        message:
          'This sign-up is no longer waiting in this browser. If you opened the link, your email is verified — sign in to continue. If not, the login page can send the email again.',
        canSignIn: true,
      };
    }
    if (failure?.status === 409 && /newer sign-up/i.test(text)) {
      return { kind: 'ended', message: text, canSignIn: true };
    }
    // 429 carries the real wait (the limiter is per hour) — never invent a shorter one.
    if ([400, 409, 429].includes(failure?.status ?? 0)) {
      return { kind: 'retry', message: text || fallback };
    }
    return { kind: 'retry', message: fallback };
  };

  const handleResend = async () => {
    if (!sentTo) return;
    const asked = generation.current;
    setResendState('sending');
    setPendingNotice('');
    try {
      const response = await authService.resendPendingSignup(sentTo);
      if (generation.current !== asked) return;
      if (response.data) {
        setSentTo(response.data.email);
        setMailLeft(response.data.emailSent);
        setRenewedAt(Date.now());
      }
      setResendState(response.data?.emailSent === false ? 'failed' : 'sent');
    } catch (err) {
      if (generation.current !== asked) return;
      const outcome = classifyPendingFailure(err, '');
      if (outcome.kind === 'verified') {
        setResendState('verified');
      } else if (outcome.kind === 'ended') {
        setResendState('idle');
        setEnded({ message: outcome.message, canSignIn: outcome.canSignIn });
      } else {
        setResendState('failed');
        setPendingNotice(outcome.message);
      }
    }
  };

  const handleChangeEmail = async (event: FormEvent) => {
    event.preventDefault();
    setChangeError('');
    if (!sentTo) return;
    // The generation this request owns; a successful change moves it on (below).
    let owned = generation.current;
    setIsChanging(true);
    try {
      const response = await authService.changePendingSignupEmail(newEmail.trim(), sentTo);
      if (generation.current !== owned) return;
      // The screen now stands for the corrected address: an answer still in flight for the old
      // one (a resend) must not land on it.
      generation.current += 1;
      owned = generation.current;
      if (response.data) {
        setSentTo(response.data.email);
        setMailLeft(response.data.emailSent);
        setRenewedAt(Date.now());
      }
      setEditingEmail(false);
      setResendState('idle');
      setPendingNotice('');
    } catch (err) {
      if (generation.current !== owned) return;
      const outcome = classifyPendingFailure(
        err,
        'Could not change the address. Please try again.'
      );
      if (outcome.kind === 'retry') {
        setChangeError(outcome.message);
      } else {
        setEditingEmail(false);
        if (outcome.kind === 'verified') setResendState('verified');
        else setEnded({ message: outcome.message, canSignIn: outcome.canSignIn });
      }
    } finally {
      // An abandoned correction must not switch off a newer one's spinner.
      if (generation.current === owned) setIsChanging(false);
    }
  };

  const startOver = () => {
    // The persistence effect forgets the waiting screen once there is no address. The form
    // starts empty (the old signup still holds its name and address) with a fresh captcha (the
    // old token was spent).
    generation.current += 1;
    setSentTo(null);
    setEnded(null);
    setEditingEmail(false);
    setChangeError('');
    setIsChanging(false);
    setResendState('idle');
    setPendingNotice('');
    setFormData({ workspaceName: '', firstName: '', lastName: '', email: '', password: '' });
    resetCaptcha();
  };

  // Nothing in this tab can continue: say why, and offer only what can work.
  if (sentTo && ended) {
    return (
      <div className="flex justify-center items-center px-4 min-h-screen bg-background">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1">
            <div ref={inboxHeadingRef} tabIndex={-1} className="outline-none">
              <CardTitle className="text-2xl">This sign-up can&apos;t continue here</CardTitle>
            </div>
            <CardDescription>{ended.message}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {ended.canSignIn && (
              <Button className="w-full" onClick={() => navigate('/login')}>
                Sign in
              </Button>
            )}
            <Button
              type="button"
              variant={ended.canSignIn ? 'ghost' : 'primary'}
              className="w-full"
              onClick={startOver}
            >
              Start a different sign-up
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Verified meanwhile (another tab, another device): nothing on the waiting screen is true any
  // more — no inbox to check, no link to resend — so it gives way to the one thing left to do.
  if (sentTo && resendState === 'verified') {
    return (
      <div className="flex justify-center items-center px-4 min-h-screen bg-background">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1">
            <div ref={inboxHeadingRef} tabIndex={-1} className="outline-none">
              <CardTitle className="text-2xl">Already verified</CardTitle>
            </div>
            <CardDescription>
              <span className="font-medium text-foreground break-all">{sentTo}</span> is verified.
              Sign in to continue setting up {formData.workspaceName.trim() || 'your workspace'}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => navigate('/login')}>
              Sign in
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

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
              {mailLeft
                ? 'We sent a verification link to '
                : 'Your workspace is ready, but the link to '}
              <span className="font-medium text-foreground break-all">{sentTo}</span>
              {mailLeft
                ? `. Open it in this browser to set up ${formData.workspaceName.trim() || 'your workspace'}.`
                : ' did not go out. Press "Resend email" to try again.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {mailLeft && (
              <p className="text-sm text-muted-foreground">
                The link works for 24 hours, and each new email replaces the previous link — use the
                newest one. Opened on another device, it verifies your email and asks you to sign
                in.
              </p>
            )}
            {/* Every state: the cleanup applies whether or not a mail went out — where it runs at all. */}
            {removedAfterDays !== null && (
              <p className="text-sm text-muted-foreground">
                A sign-up that is not verified within {removedAfterDays} days is removed, and its
                workspace name becomes available again.
              </p>
            )}
            {resendState === 'sent' && (
              <Alert variant="success">
                Sent. Check your spam folder if it does not arrive in a few minutes.
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
              // One request at a time, its own included: Button's `disabled ?? isLoading` means an
              // explicit value REPLACES the spinner's lock, so it must cover both requests.
              disabled={requestInFlight}
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
                  <Button
                    type="submit"
                    className="flex-1"
                    isLoading={isChanging}
                    disabled={requestInFlight}
                  >
                    Send to this address
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    // A correction in flight lands anyway; closing the form under it would hide it.
                    disabled={isChanging}
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
                  setChangeError('');
                  setEditingEmail(true);
                }}
              >
                Wrong address? Change it
              </Button>
            )}
            <Button type="button" variant="ghost" className="w-full" onClick={startOver}>
              Start a different sign-up
            </Button>
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
