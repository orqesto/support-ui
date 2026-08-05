import { useQuery } from '@tanstack/react-query';
import { allianceAdminService } from '@/services/alliance-admin.service';

/**
 * React-query hooks for the Alliance admin console. Query keys are namespaced by
 * allianceId so switching alliances invalidates cleanly and two alliances never
 * share a cache entry.
 */
export const useMyAlliances = () =>
  useQuery({
    queryKey: ['alliance', 'mine'],
    queryFn: () => allianceAdminService.listMyAlliances(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

export const useAllianceOverview = (allianceId: number | null) =>
  useQuery({
    queryKey: ['alliance', allianceId, 'overview'],
    queryFn: () => allianceAdminService.getOverview(allianceId as number),
    enabled: allianceId !== null,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });
