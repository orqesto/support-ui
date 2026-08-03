import { useEffect } from 'react';
import { Clock } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { usePermissions } from '@/hooks/usePermissions';
import { Permission } from '@/types/roles';
import { useAuthStore } from '@/stores/authStore';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { useBackendVersion } from '@/hooks/useBackendVersion';

/**
 * Trial countdown banner for all members while the org subscription is
 * 'trialing'. Data comes from the shared onboarding-status fetch (member-
 * readable endpoint). Hidden on /subscription, matching the gate-overlay
 * convention — that page already shows the full picture.
 */
export const TrialBanner = () => {
  const location = useLocation();
  const { hasPermission } = usePermissions();
  const selectedOrganizationId = useAuthStore((state) => state.selectedOrganizationId);
  const trial = useOnboardingStore((state) => state.trial);
  const fetchOnce = useOnboardingStore((state) => state.fetchOnce);
  const { data: backendVersion } = useBackendVersion();

  useEffect(() => {
    fetchOnce(selectedOrganizationId); // store dedupes per org
  }, [fetchOnce, selectedOrganizationId]);

  // No billing provider configured → no trials, no upgrade path. Hide entirely
  // (self-hosted and not-yet-activated managed boxes).
  if (!backendVersion?.billingEnabled) return null;
  if (location.pathname.startsWith('/subscription')) return null;
  if (trial?.status !== 'trialing' || !trial.trialEndsAt) return null;

  const msLeft = new Date(trial.trialEndsAt).getTime() - Date.now();
  const daysLeft = Math.max(0, Math.ceil(msLeft / 86_400_000));
  // Only show the Upgrade CTA to members who can reach /subscription — otherwise
  // the ProtectedRoute would bounce them straight back to the dashboard.
  const canUpgrade = hasPermission(Permission.VIEW_SUBSCRIPTION);

  return (
    <div className="mb-3 flex items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
      <span className="flex items-center gap-2 text-foreground">
        <Clock className="h-4 w-4 text-primary" />
        {msLeft <= 0
          ? 'Your trial has ended'
          : daysLeft === 0
            ? 'Your trial ends today'
            : `Your trial ends in ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}`}
      </span>
      {canUpgrade && (
        <Link to="/subscription" className="font-medium text-primary hover:underline">
          Upgrade
        </Link>
      )}
    </div>
  );
};
