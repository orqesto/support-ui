import { useState, useEffect, useRef, type FormEvent } from 'react';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Turnstile } from '@/components/common/Turnstile';
import type { TurnstileInstance } from '@marsidev/react-turnstile';
import { authService } from '@/services/auth.service';
import { twoFactorService } from '@/services/twoFactor.service';
import { useAuthStore } from '@/stores/authStore';
import { logger } from '@/lib/logger';

type Step = 'email' | 'password' | 'selectOrg' | 'totp' | 'setup2fa';

type OrgOption = { id: number; name: string; slug: string };

export const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<Step>('email');

  // Populated after password is verified for a multi-org user.
  const [orgOptions, setOrgOptions] = useState<OrgOption[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null);
  // org_pending temp token from /login; consumed by /select-organization.
  const [orgPendingToken, setOrgPendingToken] = useState('');

  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance>(null);

  // 2FA state
  const [tempToken, setTempToken] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [setup2faQr, setSetup2faQr] = useState('');
  const [setup2faSecret, setSetup2faSecret] = useState('');
  const [setup2faCode, setSetup2faCode] = useState('');

  const login = useAuthStore((state) => state.login);
  const setSelectedOrganization = useAuthStore((state) => state.setSelectedOrganization);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const state = location.state as { message?: string } | null;
    if (state?.message) {
      setInfo(state.message);
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  const resetCaptcha = () => {
    turnstileRef.current?.reset();
    setCaptchaToken(null);
  };

  // Common handler for the FE's response interpretation after /login or
  // /select-organization. Routes the user to the next step (org pick, 2FA
  // setup, 2FA challenge, or straight to dashboard).
  const handleLoginResponse = async (response: Awaited<ReturnType<typeof authService.login>>) => {
    if (!response.success || !response.data) {
      setError(response.message ?? 'Invalid credentials');
      resetCaptcha();
      return;
    }

    const data = response.data;

    if (data.requiresOrgSelection && data.tempToken && data.organizations) {
      setOrgPendingToken(data.tempToken);
      setOrgOptions(data.organizations);
      setSelectedOrgId(data.organizations[0]?.id ?? null);
      setStep('selectOrg');
      setInfo(`You have access to ${data.organizations.length} organizations. Pick one to continue.`);
      return;
    }

    if (data.twoFactorRequired && data.twoFactorSetupRequired && data.tempToken) {
      setTempToken(data.tempToken);
      setIsLoading(true);
      try {
        const setupData = await twoFactorService.forcedSetup(data.tempToken);
        setSetup2faQr(setupData.qrCodeDataUrl);
        setSetup2faSecret(setupData.secret);
        setStep('setup2fa');
        setInfo('Your organization requires two-factor authentication. Scan the QR code and enter the code to complete login.');
      } catch {
        setError('Failed to initialize 2FA setup. Please try again.');
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (data.twoFactorRequired && data.tempToken) {
      setTempToken(data.tempToken);
      setStep('totp');
      setInfo('Enter the 6-digit code from your authenticator app.');
      return;
    }

    if (!data.twoFactorRequired && data.user) {
      login(null, data.user);
      if (data.user.organizationId) {
        setSelectedOrganization(data.user.organizationId);
        logger.info(`✅ [LOGIN] Logged into organization (ID: ${data.user.organizationId})`);
      }
      navigate('/dashboard');
    }
  };

  const handleSubmitEmail = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const checkResponse = await authService.checkEmail({
        email,
        captchaToken: captchaToken ?? undefined,
      });

      if (!checkResponse.success) {
        setError(checkResponse.message ?? 'Unable to continue. Please try again.');
        resetCaptcha();
        return;
      }

      // Move to password step. Captcha is reset so a fresh token can be obtained
      // for the next request (each token is single-use server-side).
      resetCaptcha();
      setStep('password');
      setInfo('Enter your password to continue.');
    } catch {
      setError('Unable to continue. Please try again.');
      resetCaptcha();
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitPassword = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await authService.login({
        email,
        password,
        captchaToken: captchaToken ?? undefined,
      });
      await handleLoginResponse(response);
    } catch {
      setError('Invalid credentials. Please try again.');
      resetCaptcha();
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitOrgPick = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedOrgId) {
      setError('Please select an organization');
      return;
    }
    setError('');
    setIsLoading(true);

    try {
      const response = await authService.selectOrganization({
        tempToken: orgPendingToken,
        organizationId: selectedOrgId,
      });
      await handleLoginResponse(response);
    } catch {
      setError('Unable to complete login. Please log in again.');
      // Token may be expired — fall back to email step.
      setStep('email');
      setPassword('');
      setOrgPendingToken('');
      setOrgOptions([]);
      setSelectedOrgId(null);
      resetCaptcha();
    } finally {
      setIsLoading(false);
    }
  };

  const handleTotpVerify = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const data = await twoFactorService.authenticate(tempToken, totpCode);
      login(null, data.user as Parameters<typeof login>[1]);
      const orgId = (data.user as { organizationId?: number }).organizationId;
      if (orgId) setSelectedOrganization(orgId);
      navigate('/dashboard');
    } catch {
      setError('Invalid code. Please try again.');
      setTotpCode('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetup2faVerify = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const data = await twoFactorService.forcedEnable(tempToken, setup2faCode);
      login(null, data.user as Parameters<typeof login>[1]);
      const orgId = (data.user as { organizationId?: number }).organizationId;
      if (orgId) setSelectedOrganization(orgId);
      navigate('/dashboard');
    } catch {
      setError('Invalid code. Please try again.');
      setSetup2faCode('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToEmail = () => {
    setStep('email');
    setPassword('');
    setError('');
    setInfo('');
    resetCaptcha();
    setOrgPendingToken('');
    setOrgOptions([]);
    setSelectedOrgId(null);
  };

  const handleBackToPassword = () => {
    setStep('password');
    setError('');
    setInfo('Enter your password to continue.');
  };

  const onSubmit =
    step === 'email'
      ? handleSubmitEmail
      : step === 'password'
        ? handleSubmitPassword
        : step === 'selectOrg'
          ? handleSubmitOrgPick
          : step === 'totp'
            ? handleTotpVerify
            : handleSetup2faVerify;

  return (
    <div className="flex justify-center items-center px-4 min-h-screen bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">Welcome back</CardTitle>
          <CardDescription>Enter your credentials to access Odly</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            {step === 'email' && (
              <Input
                label="Email"
                type="email"
                autoComplete="username"
                placeholder="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            )}

            {step === 'password' && (
              <div>
                <div className="relative">
                  <Input
                    label="Password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
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

            {step === 'selectOrg' && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Organization</label>
                <select
                  value={selectedOrgId ?? ''}
                  onChange={(event) => setSelectedOrgId(Number(event.target.value) || null)}
                  className="px-3 py-2 w-full rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                >
                  <option value="" disabled>
                    Select organization
                  </option>
                  {orgOptions.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {step === 'totp' && (
              <div className="space-y-3">
                <div className="flex justify-center">
                  <ShieldCheck className="w-10 h-10 text-primary" />
                </div>
                <p className="text-sm text-center text-muted-foreground">
                  Open your authenticator app and enter the 6-digit code.
                </p>
                <Input
                  label="Authenticator code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  maxLength={6}
                  value={totpCode}
                  onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, ''))}
                  required
                />
              </div>
            )}

            {step === 'setup2fa' && (
              <div className="space-y-3">
                <div className="flex justify-center">
                  <ShieldCheck className="w-10 h-10 text-primary" />
                </div>
                <p className="text-sm text-center text-muted-foreground">
                  Scan this QR code with your authenticator app (e.g. Google Authenticator, Authy).
                </p>
                {setup2faQr && (
                  <div className="flex justify-center">
                    <img src={setup2faQr} alt="2FA QR code" className="w-40 h-40 rounded border" />
                  </div>
                )}
                {setup2faSecret && (
                  <p className="px-2 py-1 text-xs text-center font-mono rounded bg-muted text-muted-foreground break-all">
                    {setup2faSecret}
                  </p>
                )}
                <Input
                  label="Authenticator code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  maxLength={6}
                  value={setup2faCode}
                  onChange={(event) => setSetup2faCode(event.target.value.replace(/\D/g, ''))}
                  required
                />
              </div>
            )}

            {info && <div className="p-3 text-sm text-blue-700 bg-blue-50 rounded-md">{info}</div>}
            {error && (
              <div className="p-3 text-sm rounded-md text-destructive bg-destructive/10">
                {error}
              </div>
            )}

            <div className="flex gap-2">
              {(step === 'password' || step === 'selectOrg') && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={step === 'password' ? handleBackToEmail : handleBackToPassword}
                  disabled={isLoading}
                  className="w-24"
                >
                  Back
                </Button>
              )}
              <Button type="submit" className="flex-1" disabled={isLoading}>
                {isLoading
                  ? step === 'email'
                    ? 'Continuing...'
                    : step === 'password'
                      ? 'Signing in...'
                      : step === 'selectOrg'
                        ? 'Loading...'
                        : 'Verifying...'
                  : step === 'email'
                    ? 'Continue'
                    : step === 'password'
                      ? 'Sign in'
                      : step === 'selectOrg'
                        ? 'Continue'
                        : step === 'totp'
                          ? 'Verify'
                          : 'Verify'}
              </Button>
            </div>
            <div className="py-2 text-sm text-center text-muted-foreground">
              Don&apos;t have an account? Contact your administrator for an invitation.
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
