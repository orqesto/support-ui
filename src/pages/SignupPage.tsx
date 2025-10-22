import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { authService } from '@/services/auth.service';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Check } from 'lucide-react';

export const SignupPage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [formData, setFormData] = useState({
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    position: '',
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isValidatingToken, setIsValidatingToken] = useState(true);
  const [invitationEmail, setInvitationEmail] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [invitationRole, setInvitationRole] = useState('');
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const validateToken = async () => {
      if (!token) {
        navigate('/login', { 
          state: { message: 'You need an invitation to create an account. Please contact your administrator.' }
        });
        return;
      }

      setIsValidatingToken(true);
      try {
        // Validate the invitation token and get invitation details
        const response = await apiClient.get(`/api/auth/validate-invitation/${token}`);
        const data = response.data;

        if (!data.success || !data.data?.valid) {
          setError(data.data?.error || 'Invalid or expired invitation');
          setTimeout(() => {
            navigate('/login', { 
              state: { message: 'Invalid or expired invitation. Please request a new one.' }
            });
          }, 3000);
          return;
        }

        // Store invitation details
        const email = data.data.invitation.email;
        setInvitationEmail(email);
        setOrganizationName(data.data.invitation.organizationName || 'the organization');
        setInvitationRole(data.data.invitation.role);
      } catch (err) {
        setError('Failed to validate invitation. Please try again.');
      } finally {
        setIsValidatingToken(false);
      }
    };

    validateToken();
  }, [token, navigate]);

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError('');
  };

  const validateForm = (): string | null => {
    if (!formData.password || !formData.firstName) {
      return 'Please fill in all required fields';
    }

    if (formData.password.length < 8) {
      return 'Password must be at least 8 characters long';
    }

    if (formData.password !== formData.confirmPassword) {
      return 'Passwords do not match';
    }

    return null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!token) {
      setError('Invalid invitation link. Please use the link from your invitation email.');
      return;
    }

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsLoading(true);

    try {
      const response = await authService.register({
        email: invitationEmail, // Email comes from invitation, not user input
        password: formData.password,
        firstName: formData.firstName,
        lastName: formData.lastName,
        position: formData.position,
        invitationToken: token,
      });

      if (response.success) {
        setSuccess(true);
      } else {
        setError(response.message || 'Registration failed');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'An error occurred during registration');
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-white to-blue-50 px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <Check className="w-10 h-10 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Account Created!</CardTitle>
            <CardDescription className="text-base">
              Your account has been successfully created for <strong>{invitationEmail}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-green-50 p-4 rounded-lg text-sm text-gray-700">
              <p className="font-medium mb-2">You're all set!</p>
              <p>Your account is ready to use. You can now log in with your credentials.</p>
            </div>
            <Button
              onClick={() => navigate('/login')}
              className="w-full"
            >
              Continue to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isValidatingToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-white to-blue-50 px-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Validating invitation...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-white to-blue-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">Create your account</CardTitle>
          <CardDescription>
            You've been invited to join <strong>{organizationName}</strong> as a <strong>{invitationRole}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="First Name"
                type="text"
                placeholder="John"
                value={formData.firstName}
                onChange={(e) => handleChange('firstName', e.target.value)}
                required
              />
              <Input
                label="Last Name"
                type="text"
                placeholder="Doe"
                value={formData.lastName}
                onChange={(e) => handleChange('lastName', e.target.value)}
              />
            </div>

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-xs font-medium text-gray-700 mb-1">Invitation Email</p>
              <p className="text-sm font-semibold text-gray-900">{invitationEmail}</p>
            </div>

            <Input
              label="Position (Optional)"
              type="text"
              placeholder="e.g., Support Engineer"
              value={formData.position}
              onChange={(e) => handleChange('position', e.target.value)}
            />

            <Input
              label="Password"
              type="password"
              placeholder="At least 8 characters"
              value={formData.password}
              onChange={(e) => handleChange('password', e.target.value)}
              required
            />

            <Input
              label="Confirm Password"
              type="password"
              placeholder="Re-enter your password"
              value={formData.confirmPassword}
              onChange={(e) => handleChange('confirmPassword', e.target.value)}
              required
            />

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" isLoading={isLoading}>
              Create Account
            </Button>

            <div className="text-sm text-center text-muted-foreground">
              Already have an account?{' '}
              <Link to="/login" className="text-primary hover:underline font-medium">
                Sign in
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
