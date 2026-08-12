import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  allianceAuditService,
  type AllianceAuditListResult,
} from '@/services/alliance-audit.service';
import type { AuditQueryFilters } from '@/services/auditQueryParams';

/**
 * React-query hook for the alliance Audit log (05-09). Keyed by allianceId + page
 * + filters so paging/filtering swaps cleanly:
 *   ['alliance', id, 'audit', page, action ?? null, organizationId ?? null]
 * `placeholderData: keepPreviousData` (react-query v5) keeps the previous page on
 * screen while the next one loads, so the table doesn't flash to a Spinner on every
 * page change.
 */

export type AllianceAuditFilters = AuditQueryFilters;

export const useAllianceAudit = (allianceId: number | null, filters: AllianceAuditFilters) =>
  useQuery<AllianceAuditListResult>({
    queryKey: [
      'alliance',
      allianceId,
      'audit',
      filters.page,
      filters.action ?? null,
      filters.organizationId ?? null,
      filters.dateFrom ?? null,
      filters.dateTo ?? null,
      filters.actorEmail ?? null,
    ],
    queryFn: () => allianceAuditService.listAudit(allianceId as number, filters),
    enabled: allianceId !== null,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });

/** Distinct audit actions for this alliance's action filter (replaces page-local derivation). */
export const useAllianceAuditActions = (allianceId: number | null) =>
  useQuery({
    queryKey: ['alliance', allianceId, 'audit', 'actions'],
    queryFn: () => allianceAuditService.listAuditActions(allianceId as number),
    enabled: allianceId !== null,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });
