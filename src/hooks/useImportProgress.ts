import { isAxiosError } from 'axios';
import { useCallback, useRef, useState } from 'react';
import { logger } from '@/lib/logger';
import type { ProcessingSession } from '@/hooks/useEmailProcessingSessions';
import { useVisiblePolling } from '@/hooks/useVisiblePolling';
import { type ImportProgress, importProgressService } from '@/services/importProgress.service';

/** Every 15 s: the backend caches its counts for 15 s and samples the rate once a minute. */
export const IMPORT_PROGRESS_POLL_MS = 15_000;

/**
 * Polls a mail source's progress (its recorded runs, and a Gmail or IMAP import's listing) while
 * `enabled`, paused while the tab is hidden. With `start`, a mail source (Gmail, or an IMAP
 * mailbox, BE-12) with no run yet has its mailbox listed — asked for only when the run looks like
 * an import, so a routine poll never starts a listing.
 *
 * `supported` goes false on a 404 (not a mail source of this workspace) or a 401/403, and polling
 * stops. A failed poll keeps the last answer rather than blanking the panel.
 */
export const useImportProgress = (
  sourceId: number,
  enabled: boolean,
  start: boolean,
  intervalMs: number = IMPORT_PROGRESS_POLL_MS
) => {
  const [data, setData] = useState<ImportProgress | null>(null);
  const [supported, setSupported] = useState(true);
  const inFlight = useRef(false);
  /**
   * A refusal (404/401/403) ends polling NOW, not at the next render. `supported` is state, so the
   * effect that clears the interval only runs once React commits — and a 15 s tick landing in that
   * gap asked a refused endpoint again (seen as a flaky CI failure, 2026-09-29; reproduced by
   * firing the tick after the 403 settles and before the commit). The ref closes the gap.
   */
  const refused = useRef(false);

  const fetchOnce = useCallback(async () => {
    if (inFlight.current || refused.current) return;
    inFlight.current = true;
    try {
      setData(await importProgressService.get(sourceId, start));
    } catch (error) {
      // 404: not a mail source of this workspace. 401/403: this user may not read it — polling a
      // refusal every 15 s for ever helps nobody.
      const status = isAxiosError(error) ? error.response?.status : undefined;
      if (status === 404 || status === 401 || status === 403) {
        refused.current = true;
        setSupported(false);
      } else {
        logger.debug('import progress poll failed', { sourceId, error });
      }
    } finally {
      inFlight.current = false;
    }
  }, [sourceId, start]);

  const tick = useCallback(() => void fetchOnce(), [fetchOnce]);
  useVisiblePolling(tick, enabled && supported, intervalMs);

  return { data, supported, refresh: fetchOnce };
};

/** A run that found at least this many messages is treated as an import (it gets a listing). */
export const IMPORT_LISTING_THRESHOLD = 200;

/** The socket session is still fetching or saving. */
export const sessionRunning = (session: ProcessingSession): boolean =>
  session.isProcessing || session.status === 'started' || session.status === 'processing';
