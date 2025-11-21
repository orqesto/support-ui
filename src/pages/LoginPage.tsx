import { useState, useEffect, type FormEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { authService } from '@/services/auth.service';
import { organizationService } from '@/services/organization.service';
import { useAuthStore } from '@/stores/authStore';

export const LoginPage = () => {
  const [organizationSlug, setOrganizationSlug] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<'verify' | 'password'>('verify');
  const [userVerified, setUserVerified] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
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
      // Verify user exists in organization
      const verifyResponse = await authService.verifyUser({ organizationSlug, email });

      if (verifyResponse.success) {
        setUserVerified(true);
        setStep('password');
        setInfo(`Welcome! Please enter your password.`);
      } else {
        setError(verifyResponse.message ?? 'User not found in this organization');
      }
    } catch {
      setError('Unable to verify user. Please check your organization and email.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await authService.login({ organizationSlug, email, password });
      if (response.success && response.data) {
        login(response.data.token, response.data.user);

        // Set user's organization context
        // For non-admins, use their organizationId from the user object
        // For admins, fetch available organizations
        if (response.data.user.organizationId) {
          // Non-admin user - use their assigned organization
          setSelectedOrganization(response.data.user.organizationId);
          // eslint-disable-next-line no-console
          console.log(
            `✅ [LOGIN] Auto-selected user's organization (ID: ${response.data.user.organizationId})`
          );
        } else if (response.data.user.role === 'admin') {
          // Global admin - fetch organizations
          try {
            const orgsResponse = await organizationService.getAll('', 1, 100);
            if (orgsResponse.data.length > 0) {
              setSelectedOrganization(orgsResponse.data[0].id);
              // eslint-disable-next-line no-console
              console.log(
                `✅ [LOGIN] Auto-selected organization: ${orgsResponse.data[0].name} (ID: ${orgsResponse.data[0].id})`
              );
            }
          } catch (orgError) {
            console.error('Failed to load organizations:', orgError);
          }
        }

        navigate('/dashboard');
      } else {
        setError(response.message ?? 'Invalid password');
      }
    } catch {
      setError('Invalid password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    setStep('verify');
    setUserVerified(false);
    setPassword('');
    setError('');
    setInfo('');
  };

  return (
    <div className="flex justify-center items-center px-4 min-h-screen bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">Welcome back</CardTitle>
          <CardDescription>Enter your credentials to access the support system</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={step === 'verify' ? handleVerifyUser : handleLogin} className="space-y-4">
            <Input
              label="Organization"
              type="text"
              placeholder="resol"
              value={organizationSlug}
              onChange={(e) => setOrganizationSlug(e.target.value.toLowerCase())}
              disabled={userVerified}
              required
            />
            <Input
              label="Email"
              type="email"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={userVerified}
              required
            />
            {step === 'password' && (
              <div>
                <div className="relative">
                  <Input
                    label="Password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
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
              {step === 'password' && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBack}
                  disabled={isLoading}
                  className="w-24"
                >
                  Back
                </Button>
              )}
              <Button type="submit" className="flex-1" disabled={isLoading}>
                {isLoading
                  ? step === 'verify'
                    ? 'Verifying...'
                    : 'Signing in...'
                  : step === 'verify'
                    ? 'Continue'
                    : 'Sign in'}
              </Button>
            </div>
            <div className="text-sm text-center text-muted-foreground">
              Don&apos;t have an account? Contact your administrator for an invitation.
            </div>
            <div className="mt-4 text-sm text-center text-muted-foreground">
              <p>Demo credentials:</p>
              <p className="font-medium">admin@resol.com / password123</p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
