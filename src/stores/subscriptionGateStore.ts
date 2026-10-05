import { create } from 'zustand';

/**
 * Tracks whether the current org is gated by an inactive/expired subscription.
 * Set from the api-client response interceptor when the backend returns 402
 * (`requireActiveSubscription`). Not persisted — a fresh reload re-derives it
 * from the next request (so it clears automatically once the org is reactivated).
 *
 * Global admins never receive a 402 (the guard skips them), so this only ever
 * gates regular users in an expired org.
 */
type SubscriptionGateState = {
  gated: boolean;
  message: string | null;
  /** The 402's machine code — `SUBSCRIPTION_TRIAL_EXPIRED` or `SUBSCRIPTION_INACTIVE` — when sent. */
  code: string | null;
  /**
   * Task #8: may THIS user choose the plan (an org admin)? `null` when the backend did not say —
   * an older backend, or a 402 that is not about the trial — and the overlay keeps its old shape.
   */
  canChoosePlan: boolean | null;
  setGated: (message: string, details?: { code?: string | null; canChoosePlan?: boolean | null }) => void;
  clear: () => void;
};

export const useSubscriptionGateStore = create<SubscriptionGateState>((set) => ({
  gated: false,
  message: null,
  code: null,
  canChoosePlan: null,
  setGated: (message, details) =>
    set({
      gated: true,
      message,
      code: details?.code ?? null,
      canChoosePlan: typeof details?.canChoosePlan === 'boolean' ? details.canChoosePlan : null,
    }),
  clear: () => set({ gated: false, message: null, code: null, canChoosePlan: null }),
}));
