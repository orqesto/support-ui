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

// Which org a fetch is currently in flight for — org-scoped so switching orgs
// mid-fetch still triggers the new org's fetch (a plain boolean would swallow it).
let inFlightForOrg: number | null = null;

export const useOnboardingStore = create<OnboardingStoreState>((set, get) => ({
  status: 'unknown',
  onboarding: null,
  trial: null,
  fetchedForOrg: null,

  fetchOnce: (organizationId: number | null) => {
    if (organizationId === null) return;
    // Already have this org's data, or a fetch for THIS org is already running.
    if (get().fetchedForOrg === organizationId || inFlightForOrg === organizationId) return;
    inFlightForOrg = organizationId;
    // Drop any prior org's data immediately so the banner/redirect never act on
    // another org's status during the fetch.
    set({ status: 'unknown', onboarding: null, trial: null, fetchedForOrg: organizationId });
    onboardingService
      .getStatus()
      .then((data) => {
        if (get().fetchedForOrg !== organizationId) return; // org switched mid-flight — discard
        set({
          status: data.isComplete ? 'complete' : 'pending',
          onboarding: data.onboarding,
          trial: data.trial,
        });
      })
      .catch((error: unknown) => {
        if (get().fetchedForOrg !== organizationId) return;
        logger.error('Failed to fetch onboarding status:', error);
        set({ status: 'complete' });
      })
      .finally(() => {
        if (inFlightForOrg === organizationId) inFlightForOrg = null;
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
