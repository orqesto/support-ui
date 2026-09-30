import { isAxiosError } from 'axios';
import { useCallback, useEffect, useRef, useState } from 'react';
import { logger } from '@/lib/logger';
import { useVisiblePolling } from '@/hooks/useVisiblePolling';
import {
  importProgressService,
  type ProcessingSummaryEntry,
} from '@/services/importProgress.service';

export const PROCESSING_SUMMARY_POLL_MS = 15_000;

/**
 * The header indicator's numbers: per mail source, runs still in progress and problems wanting
 * attention. Polled every 15 s while the tab is visible (the backend caches each source's view
 * for 15 s). `refreshKey` asks again at once — the socket's run start and end move it, so the
 * indicator does not lag a whole interval behind a run everyone just saw start.
 *
 * Scoped to `organizationId`: a switch drops the last workspace's numbers before the first answer
 * for the new one arrives. A 401/403/404 stops polling for that workspace (an older backend, or a
 * role that may not read integrations) — asking a refusal every 15 s helps nobody.
 */
export const useProcessingSummary = (organizationId: number | undefined, refreshKey: number) => {
  const [entries, setEntries] = useState<ProcessingSummaryEntry[]>([]);
  const [refusedFor, setRefusedFor] = useState<number | undefined | null>(null);
  /** The workspace a request is in flight for: a switch must not wait for the old answer. */
  const inFlight = useRef<number | undefined | null>(null);
  const refused = useRef(false);
  const scope = useRef(organizationId);

  useEffect(() => {
    scope.current = organizationId;
    refused.current = false;
    setEntries([]);
    setRefusedFor(null);
  }, [organizationId]);

  const fetchOnce = useCallback(async () => {
    const askedFor = organizationId;
    if (inFlight.current === askedFor || refused.current) return;
    inFlight.current = askedFor;
    try {
      const next = await importProgressService.summary();
      // An answer for a workspace we have since left is not this workspace's.
      if (scope.current === askedFor) setEntries(next);
    } catch (error) {
      const status = isAxiosError(error) ? error.response?.status : undefined;
      if (status === 404 || status === 401 || status === 403) {
        refused.current = true;
        setRefusedFor(askedFor);
      } else {
        logger.debug('processing summary poll failed', { error });
      }
    } finally {
      if (inFlight.current === askedFor) inFlight.current = null;
    }
  }, [organizationId]);

  const tick = useCallback(() => void fetchOnce(), [fetchOnce]);
  const enabled = organizationId !== undefined && refusedFor !== organizationId;
  useVisiblePolling(tick, enabled, PROCESSING_SUMMARY_POLL_MS);

  // A run just started or ended on the socket: ask now rather than at the next tick.
  useEffect(() => {
    if (refreshKey > 0 && enabled) void fetchOnce();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new refreshKey asks
  }, [refreshKey]);

  return { entries, refresh: fetchOnce };
};
