import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';
import { useAuthStore } from '@/stores/authStore';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { useSubscriptionGateStore } from '@/stores/subscriptionGateStore';

/**
 * Full-page onboarding wizard — deliberately NOT wrapped in Layout, so it can
 * never stack with SubscriptionGateOverlay. Guards: org_admins with a pending
 * org only; if the org gets gated (402) mid-wizard, the gate wins and we exit
 * to the dashboard where the overlay owns the screen.
 */
export const OnboardingPage = () => {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const selectedOrganizationId = useAuthStore((state) => state.selectedOrganizationId);
  const status = useOnboardingStore((state) => state.status);
  const fetchOnce = useOnboardingStore((state) => state.fetchOnce);
  const gated = useSubscriptionGateStore((state) => state.gated);

  useEffect(() => {
    fetchOnce(selectedOrganizationId);
  }, [fetchOnce, selectedOrganizationId]);

  useEffect(() => {
    if (!user?.role) return; // profile still restoring — don't bounce on unknown role
    // Global admins are never onboarding subjects (their org_admin role is for the
    // system org, not the org they're viewing) — bounce them out too.
    const isOrgAdmin = user.role !== 'admin' && user.organizationRole === 'org_admin';
    if (!isOrgAdmin || status === 'complete' || gated) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, status, gated, navigate]);

  // Blocked-popup Gmail OAuth does a full-page redirect; this flag tells
  // OAuthCallbackPage to return to /onboarding instead of the settings page.
  // Set on mount, cleared on normal unmount (a hard redirect skips cleanup —
  // intentionally, so the flag survives the OAuth round-trip).
  useEffect(() => {
    sessionStorage.setItem('onboarding_resume', '1');
    return () => {
      sessionStorage.removeItem('onboarding_resume');
    };
  }, []);

  if (status !== 'pending') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <OnboardingWizard />
    </div>
  );
};
