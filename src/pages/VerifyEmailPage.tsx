import { useEffect, useState } from 'react';
import { Check, X, Loader2 } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { authService } from '@/services/auth.service';
import { logger } from '@/lib/logger';

export const VerifyEmailPage = () => {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const navigate = useNavigate();
  const token = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token');

  useEffect(() => {
    const verifyEmail = async () => {
      if (!token) {
        setStatus('error');
        setMessage('No verification token found');
        return;
      }

      try {
        const response = await authService.verifyEmail(token);
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
  }, [token]);

  const renderIcon = () => {
    switch (status) {
      case 'loading':
        return (
          <div className="mx-auto mb-4 w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
            <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
          </div>
        );
      case 'success':
        return (
          <div className="mx-auto mb-4 w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
            <Check className="w-10 h-10 text-green-600" />
          </div>
        );
      case 'error':
        return (
          <div className="mx-auto mb-4 w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
            <X className="w-10 h-10 text-red-600" />
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
              <div className="bg-green-50 p-4 rounded-lg text-sm text-gray-700">
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
              <div className="bg-red-50 p-4 rounded-lg text-sm text-gray-700">
                <p className="font-medium mb-2">What went wrong?</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>The verification link may have expired</li>
                  <li>The link may have already been used</li>
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-white to-blue-50 px-4">
      <Card className="w-full max-w-md">{renderContent()}</Card>
    </div>
  );
};
