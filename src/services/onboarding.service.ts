import { apiClient } from '@/lib/api-client';
import type { ApiResponse } from '@/types';

/** Mirrors BE OnboardingState (BE-service organizationDefaults.ts). */
export type OnboardingState = {
  status: 'pending' | 'completed' | 'skipped';
  currentStep: 1 | 2 | 3 | 4 | 5 | 6;
  aiChoice?: 'managed' | 'byo';
  aiChoiceApplied?: boolean;
  startedAt: string;
  completedAt?: string;
  skippedAt?: string;
  trialRestamped?: boolean;
};

export type TrialInfo = {
  status: 'trialing' | 'active' | 'past_due' | 'cancelled' | 'expired';
  trialEndsAt: string | null;
};

export type OnboardingStatus = {
  /** null = absent key = org predates the wizard (complete). */
  onboarding: OnboardingState | null;
  isComplete: boolean;
  trial: TrialInfo | null;
  /** True when the platform can serve managed ("our AI") mode — gates the AI step. */
  managedAiAvailable?: boolean;
};

export type OnboardingPatch = {
  currentStep?: OnboardingState['currentStep'];
  aiChoice?: 'managed' | 'byo';
};

export const onboardingService = {
  /** Member-readable — also feeds the trial banner. */
  getStatus: async (): Promise<OnboardingStatus> => {
    const response = await apiClient.get<ApiResponse<OnboardingStatus>>(
      '/api/organizations/onboarding'
    );
    if (!response.data.data) throw new Error('Onboarding status not available');
    return response.data.data;
  },

  /** org_admin only; 409 once the wizard is completed/skipped. */
  updateProgress: async (patch: OnboardingPatch): Promise<OnboardingState> => {
    const response = await apiClient.patch<ApiResponse<{ onboarding: OnboardingState }>>(
      '/api/organizations/onboarding',
      patch
    );
    if (!response.data.data) throw new Error('Onboarding update failed');
    return response.data.data.onboarding;
  },

  /** Idempotent; first call restarts the 14-day trial clock. */
  complete: async (): Promise<OnboardingState | null> => {
    const response = await apiClient.post<ApiResponse<{ onboarding: OnboardingState | null }>>(
      '/api/organizations/onboarding/complete'
    );
    return response.data.data?.onboarding ?? null;
  },

  /** Marks skipped — trial keeps its original org-creation expiry. */
  skip: async (): Promise<OnboardingState | null> => {
    const response = await apiClient.post<ApiResponse<{ onboarding: OnboardingState | null }>>(
      '/api/organizations/onboarding/skip'
    );
    return response.data.data?.onboarding ?? null;
  },
};
