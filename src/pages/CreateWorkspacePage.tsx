import { useState, useRef, type FormEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
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
  const [showPassword, setShowPassword] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance>(null);

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
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Workspace name"
              type="text"
              placeholder="Acme Support"
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

            <div className="relative">
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Create a password"
                value={formData.password}
                onChange={(event) => handleChange('password', event.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-[38px] text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
              <p className="mt-1 text-xs text-muted-foreground">{PASSWORD_HINT}</p>
            </div>

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
