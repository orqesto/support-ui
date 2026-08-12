/**
 * Central configuration for API and app settings
 */

export const API_BASE_URL = (import.meta.env.VITE_API_URL as string) || 'http://localhost:3000';

/**
 * Alliance console (Phase 5 multi-workspace-identity feature) — hidden by default.
 *
 * The alliance layer (a cross-workspace membership + its own admin console) only
 * earns its keep for a customer who owns MANY workspaces under one identity — an
 * MSP/agency, or an enterprise with sub-orgs. Until such a customer exists it is a
 * confusing surface for everyone else (three user lists, an unexplained "alliance
 * agent" role), so the whole console is gated off product-wide. This is a
 * product-level kill switch, NOT a per-org entitlement — so it is a build-time
 * constant, not a `useFeatures()` server flag.
 *
 * The alliance code stays in-repo, dormant and ready: set `VITE_ALLIANCE_CONSOLE=true`
 * (or flip the default here) to bring it back when a real multi-workspace customer
 * lands. The BE still enforces every `/api/alliances` call regardless — this only
 * controls whether the FE surfaces the console.
 */
export const ALLIANCE_CONSOLE_ENABLED = import.meta.env.VITE_ALLIANCE_CONSOLE === 'true';
