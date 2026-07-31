import { create } from 'zustand';
import { logger } from '@/lib/logger';
import {
  onboardingService,
  type OnboardingState,
  type TrialInfo,
} from '@/services/onboarding.service';

/**
 * Org onboarding status + trial info for the wizard redirect and TrialBanner.
 * Not persisted — refetched per org selection. `status: 'unknown'` while loading
 * blocks the dashboard redirect (never bounce on stale data); fetch errors
 * resolve to 'complete' (fail open: a broken status call must not trap the user
 * in a redirect loop).
 */
type OnboardingStoreState = {
  status: 'unknown' | 'pending' | 'complete';
  onboarding: OnboardingState | null;
  trial: TrialInfo | null;
  fetchedForOrg: number | null;
  fetchOnce: (organizationId: number | null) => void;
  refresh: () => Promise<void>;
  markComplete: () => void;
};

let inFlight: Promise<void> | null = null;

export const useOnboardingStore = create<OnboardingStoreState>((set, get) => ({
  status: 'unknown',
  onboarding: null,
  trial: null,
  fetchedForOrg: null,

  fetchOnce: (organizationId: number | null) => {
    if (organizationId === null) return;
    if (get().fetchedForOrg === organizationId || inFlight) return;
    set({ status: 'unknown', fetchedForOrg: organizationId });
    inFlight = onboardingService
      .getStatus()
      .then((data) => {
        set({
          status: data.isComplete ? 'complete' : 'pending',
          onboarding: data.onboarding,
          trial: data.trial,
        });
      })
      .catch((error: unknown) => {
        logger.error('Failed to fetch onboarding status:', error);
        set({ status: 'complete' });
      })
      .finally(() => {
        inFlight = null;
      });
  },

  refresh: async () => {
    try {
      const data = await onboardingService.getStatus();
      set({
        status: data.isComplete ? 'complete' : 'pending',
        onboarding: data.onboarding,
        trial: data.trial,
      });
    } catch (error) {
      logger.error('Failed to refresh onboarding status:', error);
    }
  },

  markComplete: () => set({ status: 'complete' }),
}));
