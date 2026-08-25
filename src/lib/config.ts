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

/**
 * The marketing site, used for links out of the app that are not app routes —
 * today only the sales-assisted tier's "talk to us" link in onboarding.
 *
 * Configurable rather than a literal because a self-hosted or white-labelled
 * deployment does not sit behind odly.ai, and a hardcoded link would send that
 * customer's admin to someone else's sales page.
 */
const configuredMarketingUrl = import.meta.env.VITE_MARKETING_URL as string | undefined;

// An env var that is present but EMPTY counts as unset — otherwise the contact
// link resolves to a bare "/#contact" and silently points at the app itself.
export const MARKETING_URL =
  configuredMarketingUrl && configuredMarketingUrl.trim().length > 0
    ? configuredMarketingUrl.trim()
    : 'https://odly.ai';

/** Where a customer goes to start a conversation about a sales-assisted tier. */
export const SALES_CONTACT_URL = `${MARKETING_URL.replace(/\/$/, '')}/#contact`;
