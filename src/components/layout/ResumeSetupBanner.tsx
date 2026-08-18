import { useState } from 'react';
import { Wand2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/stores/authStore';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { onboardingService } from '@/services/onboarding.service';
import { logger } from '@/lib/logger';

/**
 * Way back into the setup wizard after it was dismissed with "Finish later".
 *
 * Without this there is none: the shell only auto-redirects into the wizard
 * while onboarding is `pending`, and nothing else in the app navigates there —
 * so "Finish later" used to remove setup permanently.
 *
 * Deliberately NOT tied to the trial or to billing (unlike TrialBanner): a
 * self-hosted box has neither, and its admin still needs to finish setting up.
 */
export const ResumeSetupBanner = () => {
  const navigate = useNavigate();
  const onboarding = useOnboardingStore((state) => state.onboarding);
  const refresh = useOnboardingStore((state) => state.refresh);
  const user = useAuthStore((state) => state.user);
  const [resuming, setResuming] = useState(false);

  // Only the org_admin can act on it — the wizard configures org-wide settings,
  // and /onboarding bounces anyone else straight back out.
  const isOrgAdmin = user?.role !== 'admin' && user?.organizationRole === 'org_admin';
  const isGlobalAdmin = user?.role === 'admin';
  // org_admin who SKIPPED the wizard → resume it. Global admin on a still-PENDING
  // workspace (e.g. one they just created and switched into) → opt-in "Set up now".
  const showResume = isOrgAdmin && onboarding?.status === 'skipped';
  const showGaSetup = isGlobalAdmin && onboarding?.status === 'pending';
  if (!showResume && !showGaSetup) return null;

  const handleResume = async () => {
    setResuming(true);
    try {
      await onboardingService.resume();
      // Refresh BEFORE navigating: /onboarding bounces while the store still
      // says the wizard is finished, so navigating first would round-trip the
      // user straight back to the dashboard.
      await refresh();
      navigate('/onboarding');
    } catch (error) {
      logger.error('Failed to resume onboarding:', error);
      setResuming(false);
    }
  };

  return (
    <div className="mb-3 flex items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
      <span className="flex items-center gap-2 text-foreground">
        <Wand2 className="h-4 w-4 text-primary" />
        {showGaSetup
          ? 'This workspace is not set up yet.'
          : 'Your workspace setup is unfinished — connect a channel and choose how AI works.'}
      </span>
      <Button
        variant="ghost"
        size="sm"
        isLoading={resuming}
        onClick={() => {
          if (showGaSetup) {
            navigate('/onboarding');
          } else {
            void handleResume();
          }
        }}
      >
        {showGaSetup ? 'Set up now' : 'Finish setup'}
      </Button>
    </div>
  );
};
