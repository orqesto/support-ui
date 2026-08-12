/**
 * Shared query-param builder for the audit reads (platform + alliance). Both endpoints
 * accept the same filter set — date range, action, workspace, and an actor-email
 * substring — and filter SERVER-SIDE (so the pagination total reflects the filtered
 * set, not just the current page). Kept pure + shared so the two services can't drift
 * and the omit-when-empty logic is unit-tested in one place.
 *
 * Empty / blank filters are OMITTED entirely (rather than sent as ''), so the BE treats
 * them as "no filter". Dates are already-ISO strings; the caller converts the date-input
 * value before passing it in.
 */
export type AuditQueryFilters = {
  page: number;
  pageSize: number;
  action?: string;
  organizationId?: number;
  /** ISO timestamp — inclusive lower bound. */
  dateFrom?: string;
  /** ISO timestamp — inclusive upper bound. */
  dateTo?: string;
  /** Case-insensitive actor-email substring (BE matches against the actor's email). */
  actorEmail?: string;
};

export type AuditQueryParams = {
  page: number;
  pageSize: number;
  action?: string;
  organizationId?: number;
  dateFrom?: string;
  dateTo?: string;
  actorEmail?: string;
};

export const buildAuditQueryParams = (filters: AuditQueryFilters): AuditQueryParams => {
  const action = filters.action?.trim();
  const actorEmail = filters.actorEmail?.trim();
  const dateFrom = filters.dateFrom?.trim();
  const dateTo = filters.dateTo?.trim();

  return {
    page: filters.page,
    pageSize: filters.pageSize,
    ...(action ? { action } : {}),
    ...(filters.organizationId ? { organizationId: filters.organizationId } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
    ...(actorEmail ? { actorEmail } : {}),
  };
};

/**
 * Convert a native `<input type="date">` value (YYYY-MM-DD, or '') into an ISO timestamp
 * for the audit range. `endOfDay` pushes the upper bound to the last millisecond of the
 * day so a "to" date is inclusive of that whole day. Returns undefined for a blank input.
 */
export const dateInputToIso = (value: string, endOfDay = false): string | undefined => {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = new Date(`${trimmed}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
};
