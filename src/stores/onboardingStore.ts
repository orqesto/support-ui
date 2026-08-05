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
  /** Whether the platform offers managed ("our AI") mode — drives the wizard AI step. */
  managedAiAvailable: boolean;
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
  managedAiAvailable: false,
  fetchedForOrg: null,

  fetchOnce: (organizationId: number | null) => {
    if (organizationId === null) return;
    // Already have this org's data, or a fetch for THIS org is already running.
    if (get().fetchedForOrg === organizationId || inFlightForOrg === organizationId) return;
    inFlightForOrg = organizationId;
    // Drop any prior org's data immediately so the banner/redirect never act on
    // another org's status during the fetch.
    set({ status: 'unknown', onboarding: null, trial: null, fetchedForOrg: organizationId });
    // Retry transient failures before deciding. A pending org must not slip past
    // the onboarding gate because one status call blipped, so we only give up
    // (and fail open, to avoid trapping the user) after several attempts.
    const MAX_ATTEMPTS = 4;
    const clearInFlight = () => {
      if (inFlightForOrg === organizationId) inFlightForOrg = null;
    };
    const attempt = (attemptNo: number) => {
      onboardingService
        .getStatus()
        .then((data) => {
          if (get().fetchedForOrg !== organizationId) return clearInFlight(); // org switched — discard
          set({
            status: data.isComplete ? 'complete' : 'pending',
            onboarding: data.onboarding,
            trial: data.trial,
            managedAiAvailable: data.managedAiAvailable ?? false,
          });
          clearInFlight();
        })
        .catch((error: unknown) => {
          if (get().fetchedForOrg !== organizationId) return clearInFlight();
          if (attemptNo < MAX_ATTEMPTS) {
            setTimeout(() => {
              if (get().fetchedForOrg === organizationId) attempt(attemptNo + 1);
              else clearInFlight();
            }, 1000 * attemptNo);
            return;
          }
          // Sustained failure: fail open so a broken status call can't trap the
          // user in a redirect loop — but only after retries, so a transient blip
          // no longer leaks a pending org straight into the app.
          logger.error('Failed to fetch onboarding status after retries:', error);
          set({ status: 'complete' });
          clearInFlight();
        });
    };
    attempt(1);
  },

  refresh: async () => {
    try {
      const data = await onboardingService.getStatus();
      set({
        status: data.isComplete ? 'complete' : 'pending',
        onboarding: data.onboarding,
        trial: data.trial,
        managedAiAvailable: data.managedAiAvailable ?? false,
      });
    } catch (error) {
      logger.error('Failed to refresh onboarding status:', error);
    }
  },

  markComplete: () => set({ status: 'complete' }),
}));
