import { apiClient } from '@/lib/api-client';
import type { ApiResponse } from '@/types';

/** Mirrors BE OnboardingState (BE-service organizationDefaults.ts). */
export type OnboardingState = {
  status: 'pending' | 'completed' | 'skipped';
  currentStep: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  aiChoice?: 'managed' | 'byo';
  /**
   * Plan picked on the marketing site before signup (landing `?plan=`), carried
   * through POST /api/auth/signup. Intent only — the org is still on the free
   * plan in `trialing`. A paid value is what makes the wizard show its payment
   * step, so every partial write must preserve it (BE transitions do).
   */
  selectedPlan?: string;
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

/** Mirrors BE `SetupStepKey` (workspaceSetupState.ts), in wizard order. */
export type SetupStepKey = 'ai' | 'storage' | 'channels' | 'team' | 'knowledge';

export type SetupStepStatus = {
  key: SetupStepKey;
  satisfied: boolean;
  /** Short evidence, e.g. "2 channels connected" — rendered next to the step. */
  detail: string;
};

export type WorkspaceSetupStatus = {
  steps: SetupStepStatus[];
  allSatisfied: boolean;
  missing: SetupStepKey[];
};

export type ReconcileResult = {
  /** True only when THIS call moved the wizard to completed. */
  reconciled: boolean;
  setup: WorkspaceSetupStatus;
  onboarding: OnboardingState | null;
  isComplete: boolean;
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

  /**
   * Reopens a wizard dismissed with "Finish later" (skipped → pending).
   * 409 when the wizard was genuinely COMPLETED — that one is not resumable,
   * because reopening it would re-arm the once-only trial restamp.
   */
  resume: async (): Promise<OnboardingState | null> => {
    const response = await apiClient.post<ApiResponse<{ onboarding: OnboardingState | null }>>(
      '/api/organizations/onboarding/resume'
    );
    return response.data.data?.onboarding ?? null;
  },

  /**
   * What the workspace already has, step by step, derived from the DATABASE
   * rather than from wizard progress — so a step counts as done however it was
   * done (wizard, Settings, API, seed). org_admin only; read-only.
   */
  getSetupStatus: async (): Promise<WorkspaceSetupStatus> => {
    const response = await apiClient.get<ApiResponse<WorkspaceSetupStatus>>(
      '/api/organizations/onboarding/setup'
    );
    if (!response.data.data) throw new Error('Setup status not available');
    return response.data.data;
  },

  /**
   * For workspaces configured by hand: finish the wizard if — and only if —
   * every step is already satisfied. The server re-derives satisfaction itself,
   * so this cannot be used to skip setup. Idempotent, and a plain 200 with
   * `reconciled: false` when something is still missing.
   */
  reconcile: async (): Promise<ReconcileResult> => {
    const response = await apiClient.post<ApiResponse<ReconcileResult>>(
      '/api/organizations/onboarding/reconcile'
    );
    if (!response.data.data) throw new Error('Reconcile failed');
    return response.data.data;
  },

  /** Marks skipped — trial keeps its original org-creation expiry. */
  skip: async (): Promise<OnboardingState | null> => {
    const response = await apiClient.post<ApiResponse<{ onboarding: OnboardingState | null }>>(
      '/api/organizations/onboarding/skip'
    );
    return response.data.data?.onboarding ?? null;
  },
};
