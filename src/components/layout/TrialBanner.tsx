import { useEffect } from 'react';
import { Clock } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useOnboardingStore } from '@/stores/onboardingStore';

/**
 * Trial countdown banner for all members while the org subscription is
 * 'trialing'. Data comes from the shared onboarding-status fetch (member-
 * readable endpoint). Hidden on /subscription, matching the gate-overlay
 * convention — that page already shows the full picture.
 */
export const TrialBanner = () => {
  const location = useLocation();
  const selectedOrganizationId = useAuthStore((state) => state.selectedOrganizationId);
  const trial = useOnboardingStore((state) => state.trial);
  const fetchOnce = useOnboardingStore((state) => state.fetchOnce);

  useEffect(() => {
    fetchOnce(selectedOrganizationId); // store dedupes per org
  }, [fetchOnce, selectedOrganizationId]);

  if (location.pathname.startsWith('/subscription')) return null;
  if (trial?.status !== 'trialing' || !trial.trialEndsAt) return null;

  const msLeft = new Date(trial.trialEndsAt).getTime() - Date.now();
  const daysLeft = Math.max(0, Math.ceil(msLeft / 86_400_000));

  return (
    <div className="mb-3 flex items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
      <span className="flex items-center gap-2 text-foreground">
        <Clock className="h-4 w-4 text-primary" />
        {daysLeft === 0
          ? 'Your trial ends today'
          : `Your trial ends in ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}`}
      </span>
      <Link to="/subscription" className="font-medium text-primary hover:underline">
        Upgrade
      </Link>
    </div>
  );
};
