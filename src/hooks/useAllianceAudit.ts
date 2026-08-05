import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  allianceAuditService,
  type AllianceAuditListResult,
} from '@/services/alliance-audit.service';

/**
 * React-query hook for the alliance Audit log (05-09). Keyed by allianceId + page
 * + filters so paging/filtering swaps cleanly:
 *   ['alliance', id, 'audit', page, action ?? null, organizationId ?? null]
 * `placeholderData: keepPreviousData` (react-query v5) keeps the previous page on
 * screen while the next one loads, so the table doesn't flash to a Spinner on every
 * page change.
 */

export type AllianceAuditFilters = {
  page: number;
  pageSize: number;
  action?: string;
  organizationId?: number;
};

export const useAllianceAudit = (allianceId: number | null, filters: AllianceAuditFilters) =>
  useQuery<AllianceAuditListResult>({
    queryKey: [
      'alliance',
      allianceId,
      'audit',
      filters.page,
      filters.action ?? null,
      filters.organizationId ?? null,
    ],
    queryFn: () =>
      allianceAuditService.listAudit(allianceId as number, {
        page: filters.page,
        pageSize: filters.pageSize,
        action: filters.action,
        organizationId: filters.organizationId,
      }),
    enabled: allianceId !== null,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });
