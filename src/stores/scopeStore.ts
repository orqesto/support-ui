import { create } from 'zustand';

/**
 * Admin-console scope (D-ADM-1).
 *
 * The Alliance admin console renders in its own org-agnostic shell above the
 * org-switcher. Its scope (which alliance the admin is managing) is derived from
 * the URL (`/console/alliance/:allianceId`) — AdminShell sets it on mount and
 * clears it on unmount. Because the URL is the source of truth, this store is
 * deliberately NOT wrapped in `persist` (unlike authStore/departmentContextStore):
 * a stale persisted scope must never outlive the route.
 *
 * The api-client interceptor reads `allianceId` here to attach the transport-only
 * `X-Alliance-Context` header. That header is NEVER an authorization input — the
 * backend authorizes every alliance call from the route param (T-04-10 / T-05-01).
 */
export type AdminScope = 'alliance' | 'platform';

type ScopeState = {
  scope: AdminScope | null;
  allianceId: number | null;
  setScope: (next: { scope: AdminScope; allianceId: number | null }) => void;
  clearScope: () => void;
};

export const useScopeStore = create<ScopeState>((set) => ({
  scope: null,
  allianceId: null,
  setScope: ({ scope, allianceId }) => set({ scope, allianceId }),
  clearScope: () => set({ scope: null, allianceId: null }),
}));
