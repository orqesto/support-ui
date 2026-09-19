import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { getApiErrorMessage, getErrorStatus } from '@/lib/errorMessages';
import {
  customApiLookupService,
  type CustomApiLookupResult,
  type LookupRequest,
  type LookupSurface,
} from '@/services/customApiLookup.service';

/**
 * State for the custom-API lookup panel (CA-3).
 *
 * ⛔ THERE IS NO EFFECT HERE, AND THAT IS THE POINT. Every lookup is a press. N enabled endpoints
 * must not become N outbound calls to a client's vendor every time any agent opens any thread
 * (SC1) — and a hook that fetched on mount would break that from the UI side while the backend
 * stayed innocent.
 *
 * `hasRun` distinguishes "nobody has asked yet" from "asked, and there is nothing" — the panel
 * must not show an empty state that reads like a failed lookup before anyone pressed anything.
 */
const AVAILABILITY_KEY = 'custom-api-lookup-availability';

/**
 * Should the lookup panel render at all? (Release blocker, 2026-09-19.)
 *
 * The panel used to render on EVERY thread and EVERY contact in every workspace, and only stood
 * down after a press came back 404. On a backend that has the route, a workspace with nothing
 * configured instead answered "No integrations are set up for this workspace yet" — a dead
 * control shown to every client, with no screen yet to set one up. So the panel now asks first.
 *
 * ⛔ FAILS CLOSED. Loading, `available: false`, a 404 (an OLDER backend without this route — the
 * frontend ships from `main` independently of the backend tag) and any other error ALL render
 * nothing. The cost of a false "no" is a hidden button; the cost of a false "yes" is the dead
 * control this exists to remove.
 *
 * Keyed on org AND user AND surface: the answer depends on the caller's department scope (D26)
 * and on where each lookup declared it renders (D15). Cached for five minutes and deduped across
 * every panel on screen; never polled. `retry: false` because a 404 is an answer, not a blip.
 */
export function useCustomApiLookupAvailability(surface: LookupSurface): boolean {
  const orgId = useAuthStore(
    (state) => state.selectedOrganizationId ?? state.user?.organizationId ?? null
  );
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const { data } = useQuery({
    queryKey: [AVAILABILITY_KEY, orgId, userId, surface],
    queryFn: () => customApiLookupService.availability(surface),
    enabled: orgId !== null,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  return data === true;
}

export function useCustomApiLookup(target: Pick<LookupRequest, 'conversationId' | 'contactId'>) {
  const [results, setResults] = useState<CustomApiLookupResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * ⚠️ THE SKEW WINDOW, handled rather than described. A push to `main` deploys this frontend while
   * the backend ships on a tag, so this panel WILL exist in production before the CA-3 backend
   * does. Without this, every agent gets a Look up button that answers "the lookup could not be
   * completed" — worse than no button at all, because it reads as a broken integration rather than
   * a feature that has not shipped yet. A 404 on the route itself means this deployment has no
   * lookup endpoint, so the panel stands down entirely.
   */
  const [unavailable, setUnavailable] = useState(false);
  const queryClient = useQueryClient();

  /**
   * ⛔ CLEAR WHEN THE CUSTOMER CHANGES. Audit pass 5: the results live in state, and nothing reset
   * them when the agent moved to another thread — so one customer's order numbers, statuses and
   * totals could sit in the panel under a DIFFERENT customer's conversation, labelled as theirs.
   * That is the D35 failure arriving through the UI instead of the API.
   *
   * ⚠️ This effect CLEARS, it never fetches. An effect that fetched would break SC1 — N enabled
   * endpoints must not become N outbound calls every time an agent opens a thread.
   */
  useEffect(() => {
    setResults([]);
    setHasRun(false);
    setError(null);
    setUnavailable(false);
  }, [target.conversationId, target.contactId]);

  const run = useCallback(
    async (manual?: { endpointId: number; parameter: string }) => {
      setLoading(true);
      setError(null);
      try {
        const data = await customApiLookupService.run({ ...target, ...manual });
        // A manual re-run answers for ONE endpoint; merge it over the existing cards rather than
        // replacing them, or looking up an order number would blank every other integration.
        setResults((previous) =>
          manual
            ? previous.map((card) => data.find((row) => row.endpointId === card.endpointId) ?? card)
            : data
        );
        setHasRun(true);
        // The press is the freshest evidence there is. A full run that found NOTHING to run means
        // the cached "available" is stale (an admin disabled the last lookup since): refetch it so
        // the panel stands down, rather than keep offering a button that does nothing.
        if (!manual && data.length === 0) {
          void queryClient.invalidateQueries({ queryKey: [AVAILABILITY_KEY] });
        }
      } catch (err) {
        // ⛔ `getErrorStatus`, never `err.response.status`. The api-client interceptor builds a
        // FRESH Error with `status` copied onto it and `.response` dropped entirely, so reading the
        // axios shape here type-checks, looks right and NEVER MATCHES — which is how nine call
        // sites once turned real 403s and 429s into generic "something went wrong" copy. This hook
        // had the same bug until `errorShape.test.ts` caught it.
        const status = getErrorStatus(err);
        if (status === 404) {
          setUnavailable(true);
        } else {
          // ⛔ SHOW WHAT THE BACKEND SAID. A hardcoded string throws away a reason the agent could
          // act on — "the vendor rejected our credentials" becomes "something went wrong", which is
          // the failure `errorShape.test.ts` exists to prevent and which it caught here.
          setError(getApiErrorMessage(err) ?? 'The lookup could not be completed.');
        }
      } finally {
        setLoading(false);
      }
    },
    [target.conversationId, target.contactId, queryClient]
  );

  return { results, loading, hasRun, error, unavailable, run };
}
