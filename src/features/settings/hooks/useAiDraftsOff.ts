import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getErrorStatus } from '@/lib/errorMessages';
import { organizationService } from '@/services/organization.service';
import { useAuthStore } from '@/stores/authStore';

export const AI_DRAFTS_KEY = 'ai-drafts';

/**
 * Has this workspace switched AI drafts off? (support-service, 2026-09-24)
 *
 * `off` is false while loading and on ANY error, including a 404 from a backend that has not
 * shipped the route yet — the frontend reaches production on its own schedule, and a backend
 * without the setting drafts as before. That is safe because the backend is the gate: every
 * drafting endpoint answers 409 AI_DRAFTS_OFF when the setting is on, and the callers render
 * that. What this hook decides is only what the agent is OFFERED.
 *
 * `resolved` is for the one place that must not guess: showing a reply a model wrote BEFORE
 * drafts were switched off (stored on the message). The backend cannot refuse that text — it is
 * already in the payload — so the UI offers it only on a real answer, never while loading and
 * never after a failed read.
 *
 * Keyed on the org (switching workspace must not carry the answer over). Refetched on window
 * focus once stale, so a change made in another tab shows up when the agent comes back — opted
 * in HERE because the app's QueryClient turns focus refetching off for every query (main.tsx).
 */
export function useAiDraftsOff(): { off: boolean; resolved: boolean; available: boolean } {
  const orgId = useAuthStore(
    (state) => state.selectedOrganizationId ?? state.user?.organizationId ?? null
  );
  const query = useQuery({
    queryKey: [AI_DRAFTS_KEY, orgId],
    // A 404 is an ANSWER — this backend has no such setting — not a failure to retry.
    queryFn: async () => {
      try {
        return { ...(await organizationService.getAiDrafts()), available: true };
      } catch (err) {
        if (getErrorStatus(err) === 404) return { off: false, available: false };
        throw err;
      }
    },
    enabled: orgId !== null,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
    retry: false,
  });
  return {
    off: query.data?.off === true,
    // "The backend ANSWERED" — not merely "the request settled". A 500 leaves this false, so a
    // stored AI draft is never offered on the strength of a failed read (fail closed); a 404 is
    // an answer (that backend has no such mode) and counts.
    resolved: query.data !== undefined,
    // False on a backend without the setting — the switch is hidden there rather than offered
    // and refused. Unknown (loading, other errors) also reads false: nothing to switch yet.
    available: query.data?.available === true,
  };
}

/** Re-read the setting — after saving it, or when a 409 AI_DRAFTS_OFF says the copy is stale. */
export function useRefreshAiDrafts(): () => void {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: [AI_DRAFTS_KEY] });
  };
}
