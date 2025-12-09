import { useState, useEffect, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Turnstile } from '@/components/common/Turnstile';
import { authService } from '@/services/auth.service';

export const ForgotPasswordPage = () => {
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  // Pre-fill email from login page if provided
  useEffect(() => {
    const state = location.state as { email?: string } | null;
    if (state?.email) {
      setEmail(state.email);
    }
  }, [location]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim()) {
      setError('Email address is required');
      return;
    }
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    // Validate captcha
    if (!captchaToken) {
      setError('Please complete the security check');
      return;
    }

    setIsLoading(true);

    try {
      await authService.forgotPassword(email.trim(), captchaToken || undefined);
      setSuccess(true);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'An error occurred. Please try again.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex justify-center items-center px-4 min-h-screen bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl">Check your email</CardTitle>
            <CardDescription>
              If an account exists with that email, we&apos;ve sent password reset instructions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="p-4 text-sm text-green-700 bg-green-50 rounded-md">
                <p className="mb-2 font-medium">Email sent successfully!</p>
                <p>Check your inbox for a link to reset your password.</p>
                <p className="mt-2">The link will expire in 1 hour.</p>
              </div>
              <Link to="/login">
                <Button variant="outline" className="w-full">
                  Back to Login
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex justify-center items-center px-4 min-h-screen bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">Forgot password?</CardTitle>
          <CardDescription>
            Enter your email address and we&apos;ll send you a link to reset your password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email"
              type="email"
              placeholder="your.email@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            {error && (
              <div className="p-3 text-sm rounded-md text-destructive bg-destructive/10">
                {error}
              </div>
            )}
            <div className="flex justify-center">
              <Turnstile
                onSuccess={(token) => setCaptchaToken(token)}
                onError={() => setError('Security check failed. Please try again.')}
              />
            </div>
            <Button type="submit" className="w-full" isLoading={isLoading} disabled={!captchaToken}>
              Send reset link
            </Button>
            <Link to="/login">
              <Button variant="ghost" className="w-full">
                Back to Login
              </Button>
            </Link>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
