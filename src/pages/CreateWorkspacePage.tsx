import { useState, useRef, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
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
const PASSWORD_HINT = 'At least 8 characters, with one uppercase letter and one number.';
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
 * accept-invitation flow (SignupPage). On success the BE sets the httpOnly `jwt`
 * cookie (auto-login), so we store the returned user/org exactly like a password
 * login and hand off to /dashboard, which routes a fresh pending org into the
 * onboarding wizard.
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

      if (response.success && response.data) {
        // Auto-login: the BE already set the httpOnly jwt cookie. Mirror the
        // password-login store writes (token stays null — cookie-based auth),
        // then hand off to /dashboard which routes a fresh pending org into the
        // onboarding wizard.
        login(null, response.data.user);
        setSelectedOrganization(response.data.organization.id);
        navigate('/dashboard');
        return;
      }

      setError(response.message ?? response.error ?? 'Could not create your workspace.');
      resetCaptcha();
    } catch (err) {
      const status = (err as { status?: number } | null)?.status;
      if (status === 409) {
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

  return (
    <div className="flex justify-center items-center px-4 min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50">
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
              <span className="text-xs text-gray-500 dark:text-gray-400">
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
