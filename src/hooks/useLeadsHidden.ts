import { useQuery } from '@tanstack/react-query';
import { getErrorStatus } from '@/lib/errorMessages';
import { organizationService } from '@/services/organization.service';
import { useAuthStore } from '@/stores/authStore';

export const LEAD_CONFIG_KEY = 'lead-config-status';

/**
 * Should the lead UI be HIDDEN for this workspace? (owner decision, 2026-10-21: "hide unless
 * configured").
 *
 * True ONLY on an explicit `configured === false` from `GET /api/organizations/lead-config` —
 * no existing department is opted in, so lead qualification never runs and "Lead" filters,
 * "Mark as lead" and the Lead tab only mislead.
 *
 * ⛔ Everything else reads false (= today's behaviour, the lead UI shows):
 *   - loading, so the controls do not flash away and back;
 *   - a backend that predates the field (`configured` absent);
 *   - 403 — the route needs VIEW_ORGANIZATION_SETTINGS, which an agent may not hold;
 *   - 404 or any other failure.
 * Hiding on a guess would take away a working control; showing one that does nothing is what
 * the product did until now.
 *
 * One cached read per workspace, shared by every card, header and filter (react-query dedupes),
 * so a list of 50 threads is one request, not 50.
 */
export function useLeadsHidden(): boolean {
  const orgId = useAuthStore(
    (state) => state.selectedOrganizationId ?? state.user?.organizationId ?? null
  );
  const query = useQuery({
    queryKey: [LEAD_CONFIG_KEY, orgId],
    queryFn: async (): Promise<{ configured?: boolean } | null> => {
      try {
        const config = await organizationService.getLeadConfig();
        return { configured: config.configured };
      } catch (err) {
        // An answer, not a failure to retry: this caller may not read the setting, or the
        // backend has no such route. Either way the UI stays as it was.
        const status = getErrorStatus(err);
        if (status === 403 || status === 404) return null;
        throw err;
      }
    },
    enabled: orgId !== null,
    staleTime: 60 * 1000,
    // Opted in here: the app's QueryClient turns focus refetching off (main.tsx), and an admin
    // who opts a department in from another tab should see the lead UI on coming back.
    refetchOnWindowFocus: true,
    retry: false,
    // Kept for the session: one tiny entry per workspace, and a finite gcTime would leave a
    // garbage-collection timer behind every unmounted header (md4.header.menu pins zero timers).
    gcTime: Infinity,
  });
  return query.data?.configured === false;
}
