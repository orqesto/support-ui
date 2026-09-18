import { useCallback, useState } from 'react';
import { getApiErrorMessage, getErrorStatus } from '@/lib/errorMessages';
import {
  customApiLookupService,
  type CustomApiLookupResult,
  type LookupRequest,
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
    [target.conversationId, target.contactId]
  );

  return { results, loading, hasRun, error, unavailable, run };
}
