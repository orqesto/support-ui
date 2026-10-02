import { useEffect, useRef, useState } from 'react';
import { Check, X, Loader2 } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { authService } from '@/services/auth.service';
import { logger } from '@/lib/logger';
import { readPendingSignup, writePendingSignup } from '@/lib/pendingSignup';
import { useAuthStore } from '@/stores/authStore';

export const VerifyEmailPage = () => {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  const setSelectedOrganization = useAuthStore((state) => state.setSelectedOrganization);
  const token = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token');
  // The token is single-use. StrictMode runs this effect twice in development, and the second
  // POST would be refused and overwrite the result of the first — so post it once per token.
  const postedFor = useRef<string | null>(null);

  useEffect(() => {
    if (token && postedFor.current === token) return;
    postedFor.current = token;
    const verifyEmail = async () => {
      if (!token) {
        setStatus('error');
        setMessage('No verification token found');
        return;
      }

      try {
        const response = await authService.verifyEmail(token);
        // A "check your inbox" screen saved in this tab is forgotten only when it is THIS signup
        // (the BE names the user only when it signed this browser in). A link for another signup
        // pasted into the tab must not erase a different signup's waiting screen — the backend
        // leaves another signup's cookie alone for the same reason; a stale entry corrects itself
        // on the next resend ("already verified").
        const saved = readPendingSignup();
        const verifiedEmail = response.data?.signedIn ? response.data.user?.email : undefined;
        if (saved && verifiedEmail && saved.email.toLowerCase() === verifiedEmail.toLowerCase()) {
          writePendingSignup(null);
        }
        // Opened in the browser that signed up: the BE signed it in. Store the session like a
        // password login and continue to /dashboard, which opens the onboarding wizard.
        if (response.success && response.data?.signedIn && response.data.user) {
          login(null, response.data.user);
          if (response.data.user.organizationId) {
            setSelectedOrganization(response.data.user.organizationId);
          }
          navigate('/dashboard', { replace: true });
          return;
        }
        if (response.success) {
          setStatus('success');
          setMessage(response.message ?? 'Email verified successfully');
        } else {
          setStatus('error');
          setMessage(response.message ?? 'Verification failed');
        }
      } catch {
        setStatus('error');
        setMessage('Verification failed. The link may have expired or already been used.');
      }
    };

    verifyEmail().catch((error) => {
      logger.error('Failed to verify email:', error);
    });
  }, [token, login, setSelectedOrganization, navigate]);

  const renderIcon = () => {
    switch (status) {
      case 'loading':
        return (
          <div className="mx-auto mb-4 w-16 h-16 bg-primary-muted rounded-full flex items-center justify-center">
            <Loader2 className="w-10 h-10 text-muted-foreground animate-spin" />
          </div>
        );
      case 'success':
        return (
          <div className="mx-auto mb-4 w-16 h-16 bg-success-muted rounded-full flex items-center justify-center">
            <Check className="w-10 h-10 text-success" />
          </div>
        );
      case 'error':
        return (
          <div className="mx-auto mb-4 w-16 h-16 bg-destructive-muted rounded-full flex items-center justify-center">
            <X className="w-10 h-10 text-destructive" />
          </div>
        );
    }
  };

  const renderContent = () => {
    switch (status) {
      case 'loading':
        return (
          <>
            <CardHeader className="text-center">
              {renderIcon()}
              <CardTitle className="text-2xl">Verifying Your Email</CardTitle>
              <CardDescription>Please wait while we verify your email address...</CardDescription>
            </CardHeader>
          </>
        );
      case 'success':
        return (
          <>
            <CardHeader className="text-center">
              {renderIcon()}
              <CardTitle className="text-2xl">Email Verified!</CardTitle>
              <CardDescription>{message}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-success-muted p-4 rounded-lg text-sm text-muted-foreground">
                <p className="font-medium mb-2">You&apos;re all set!</p>
                <p>
                  Your email has been successfully verified. You can now log in to your account.
                </p>
              </div>
              <Button onClick={() => navigate('/login')} className="w-full">
                Continue to Login
              </Button>
            </CardContent>
          </>
        );
      case 'error':
        return (
          <>
            <CardHeader className="text-center">
              {renderIcon()}
              <CardTitle className="text-2xl">Verification Failed</CardTitle>
              <CardDescription>{message}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-destructive-muted p-4 rounded-lg text-sm text-muted-foreground">
                <p className="font-medium mb-2">What went wrong?</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>The verification link may have expired</li>
                  <li>
                    The link may have already been used — by you in another tab, or by your mail
                    provider&apos;s link scanner. Then your email is already verified: sign in.
                  </li>
                  <li>The token might be invalid</li>
                </ul>
              </div>
              <div className="flex flex-col gap-2">
                <Link to="/login" className="w-full">
                  <Button variant="outline" className="w-full">
                    Go to Login
                  </Button>
                </Link>
                <Link to="/signup" className="w-full">
                  <Button variant="ghost" className="w-full">
                    Create New Account
                  </Button>
                </Link>
              </div>
            </CardContent>
          </>
        );
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">{renderContent()}</Card>
    </div>
  );
};
