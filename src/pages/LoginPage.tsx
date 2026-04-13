import { useState, useEffect, useRef, type FormEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Turnstile } from '@/components/common/Turnstile';
import type { TurnstileInstance } from '@marsidev/react-turnstile';
import { authService } from '@/services/auth.service';
import { useAuthStore } from '@/stores/authStore';
import { logger } from '@/lib/logger';

export const LoginPage = () => {
  const [organizationSlug, setOrganizationSlug] = useState('');
  const [userOrganizations, setUserOrganizations] = useState<
    Array<{ id: number; name: string; slug: string }>
  >([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<'email' | 'selectOrg' | 'password'>('email');
  const [showPassword, setShowPassword] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance>(null);
  const login = useAuthStore((state) => state.login);
  const setSelectedOrganization = useAuthStore((state) => state.setSelectedOrganization);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Show info message from redirect (e.g., from signup page)
    const state = location.state as { message?: string } | null;
    if (state?.message) {
      setInfo(state.message);
      // Clear the state to prevent message from persisting on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  const handleVerifyUser = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // Verify user exists
      const verifyResponse = await authService.verifyUser({
        email,
        captchaToken: captchaToken ?? undefined,
      });

      if (verifyResponse.success && verifyResponse.data) {
        setUserOrganizations(verifyResponse.data.organizations);
        
        if (verifyResponse.data.organizations.length === 0) {
          setError('No organizations found for this user');
        } else if (verifyResponse.data.organizations.length === 1) {
          // Auto-select single organization and go straight to password
          setOrganizationSlug(verifyResponse.data.organizations[0].slug);
          setStep('password');
          setInfo('Welcome! Please enter your password.');
        } else {
          // Multiple orgs - show org selector
          setStep('selectOrg');
          setInfo(`Welcome! You have access to ${verifyResponse.data.organizations.length} organizations. Please select one to continue.`);
        }
        
        // Reset CAPTCHA after successful verification for fresh token on login
        turnstileRef.current?.reset();
        setCaptchaToken(null);
      } else {
        setError(verifyResponse.message ?? 'User not found');
        // Reset CAPTCHA on error
        turnstileRef.current?.reset();
        setCaptchaToken(null);
      }
    } catch {
      setError('Unable to verify user. Please check your email.');
      // Reset CAPTCHA on error
      turnstileRef.current?.reset();
      setCaptchaToken(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectOrg = (e: FormEvent) => {
    e.preventDefault();
    if (!organizationSlug) {
      setError('Please select an organization');
      return;
    }
    setError('');
    setStep('password');
    setInfo('Please enter your password.');
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await authService.login({
        organizationSlug,
        email,
        password,
        captchaToken: captchaToken ?? undefined,
      });
      if (response.success && response.data) {
        login(response.data.token, response.data.user);

        // Set user's organization context from login response
        if (response.data.user.organizationId) {
          setSelectedOrganization(response.data.user.organizationId);
          logger.info(
            `✅ [LOGIN] Logged into organization (ID: ${response.data.user.organizationId})`
          );
        }

        navigate('/dashboard');
      } else {
        setError(response.message ?? 'Invalid password');
        // Reset CAPTCHA on error
        turnstileRef.current?.reset();
        setCaptchaToken(null);
      }
    } catch {
      setError('Invalid password. Please try again.');
      // Reset CAPTCHA on error
      turnstileRef.current?.reset();
      setCaptchaToken(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToEmail = () => {
    setStep('email');
    setPassword('');
    setError('');
    setInfo('');
    setCaptchaToken(null);
    setOrganizationSlug('');
    setUserOrganizations([]);
  };

  const handleBackToOrgSelect = () => {
    setStep('selectOrg');
    setPassword('');
    setError('');
    setInfo('Please select an organization.');
  };

  return (
    <div className="flex justify-center items-center px-4 min-h-screen bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">Welcome back</CardTitle>
          <CardDescription>Enter your credentials to access Odly</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={
              step === 'email'
                ? handleVerifyUser
                : step === 'selectOrg'
                  ? handleSelectOrg
                  : handleLogin
            }
            className="space-y-4"
          >
            {step === 'email' && (
              <Input
                label="Email"
                type="email"
                placeholder="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            )}
            {step === 'selectOrg' && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Organization
                </label>
                <select
                  value={organizationSlug}
                  onChange={(e) => setOrganizationSlug(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                >
                  <option value="" disabled>
                    Select organization
                  </option>
                  {userOrganizations.map((org) => (
                    <option key={org.id} value={org.slug}>
                      {org.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {step === 'password' && (
              <div>
                <div className="relative">
                  <Input
                    label="Password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
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
                </div>
                <div className="mt-2 text-right">
                  <Link
                    to="/forgot-password"
                    state={{ email }}
                    className="text-sm transition-colors text-primary hover:text-primary/80"
                  >
                    Forgot password?
                  </Link>
                </div>
              </div>
            )}

            {info && <div className="p-3 text-sm text-blue-700 bg-blue-50 rounded-md">{info}</div>}
            {error && (
              <div className="p-3 text-sm rounded-md text-destructive bg-destructive/10">
                {error}
              </div>
            )}
            <div className="flex gap-2">
              {(step === 'selectOrg' || step === 'password') && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={step === 'selectOrg' ? handleBackToEmail : handleBackToOrgSelect}
                  disabled={isLoading}
                  className="w-24"
                >
                  Back
                </Button>
              )}
              <Button type="submit" className="flex-1" disabled={isLoading}>
                {isLoading
                  ? step === 'email'
                    ? 'Verifying...'
                    : step === 'selectOrg'
                      ? 'Loading...'
                      : 'Signing in...'
                  : step === 'email'
                    ? 'Continue'
                    : step === 'selectOrg'
                      ? 'Continue'
                      : 'Sign in'}
              </Button>
            </div>
            <div className="py-2 text-sm text-center text-muted-foreground">
              Don&apos;t have an account? Contact your administrator for an invitation.
            </div>
            <div className="py-2 mt-4 text-sm text-center text-muted-foreground">
              <p>Demo credentials:</p>
              <p className="font-medium">support@arasaka.com / password123</p>
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
