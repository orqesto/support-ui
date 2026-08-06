import { apiClient } from '@/lib/api-client';

/**
 * Thin API layer for the alliance Audit log (05-09, OQ4 v1 = a filtered READ over
 * the existing per-org audit rows — no new write path). Mirrors
 * alliance-scim.service.ts: a `base(id)` helper hard-scoped by the allianceId in
 * the route param, and the `sendSuccess` envelope unwrapped as `.data.data`.
 *
 * Unlike the other alliance reads, the audit list is PAGINATED: the controller
 * places the page metadata at the TOP LEVEL of the envelope (`.data.pagination`),
 * alongside the rows at `.data.data`. `listAudit` returns both so the page can
 * drive ui/Pagination without re-deriving totals.
 */

/** One audit event, scoped to an org in this alliance. Timestamps are ISO strings. */
export type AllianceAuditRow = {
  id: number;
  action: string;
  entity: string;
  entityId: string;
  organizationId: number | null;
  organizationName: string | null;
  actorUserId: number | null;
  actorName: string | null;
  actorEmail: string | null;
  details: unknown;
  createdAt: string;
};

/** Top-level page metadata — lives at `.data.pagination`, NOT inside `.data.data`. */
export type AllianceAuditPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
};

/** Query filters — the org filter is INTERSECTED with the alliance's org set by the BE. */
export type ListAuditParams = {
  page: number;
  pageSize: number;
  action?: string;
  organizationId?: number;
};

/** `listAudit` result — rows + the top-level pagination block. */
export type AllianceAuditListResult = {
  rows: AllianceAuditRow[];
  pagination: AllianceAuditPagination;
};

const base = (allianceId: number): string => `/api/alliances/${allianceId}`;

export const allianceAuditService = {
  listAudit: async (
    allianceId: number,
    params: ListAuditParams
  ): Promise<AllianceAuditListResult> => {
    const res = await apiClient.get<{
      data: AllianceAuditRow[];
      pagination: AllianceAuditPagination;
    }>(`${base(allianceId)}/audit`, {
      params: {
        page: params.page,
        pageSize: params.pageSize,
        ...(params.action ? { action: params.action } : {}),
        ...(params.organizationId ? { organizationId: params.organizationId } : {}),
      },
    });
    return { rows: res.data.data, pagination: res.data.pagination };
  },
};
