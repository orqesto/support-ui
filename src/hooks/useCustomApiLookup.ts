import { useCallback, useState } from 'react';
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
      } catch {
        // One reason, not a stack: the agent can act on "it did not work", and per-integration
        // failures already arrive as their own cards from the backend.
        setError('The lookup could not be completed.');
      } finally {
        setLoading(false);
      }
    },
    [target.conversationId, target.contactId]
  );

  return { results, loading, hasRun, error, run };
}
