import type { Organization } from '@/services/organization.service';

/**
 * Pure formatters for the two enrichment columns the global-admin workspaces list
 * (getAllOrganizations) attaches — `plan` and `memberCount`. Kept out of the component
 * so they're unit-testable and the null/undefined fallbacks stay in one place.
 */

/** Plan column: the plan's display name, or an em-dash when the workspace has no plan. */
export const formatPlanLabel = (plan: Organization['plan']): string =>
  plan ? plan.displayName : '—';

/**
 * Members column: the active member count as a string. A missing count (older payloads
 * that predate the enrichment) reads as "—" rather than a misleading "0".
 */
export const formatMemberCount = (memberCount: Organization['memberCount']): string =>
  typeof memberCount === 'number' ? memberCount.toString() : '—';
