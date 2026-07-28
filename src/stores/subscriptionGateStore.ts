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
  setGated: (message: string) => void;
  clear: () => void;
};

export const useSubscriptionGateStore = create<SubscriptionGateState>((set) => ({
  gated: false,
  message: null,
  setGated: (message: string) => set({ gated: true, message }),
  clear: () => set({ gated: false, message: null }),
}));
