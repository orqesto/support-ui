import { isAxiosError } from 'axios';
import { useCallback, useEffect, useRef, useState } from 'react';
import { logger } from '@/lib/logger';
import type { ProcessingSession } from '@/hooks/useEmailProcessingSessions';
import { type ImportProgress, importProgressService } from '@/services/importProgress.service';

/** Every 15 s: the backend caches its counts for 15 s and samples the rate once a minute. */
export const IMPORT_PROGRESS_POLL_MS = 15_000;

/**
 * Polls a Gmail source's import progress while `enabled`, paused while the tab is hidden. With
 * `start`, a source with no run yet has its mailbox listed — asked for only when the run looks
 * like an import, so a routine poll never starts a listing.
 *
 * `supported` goes false on a 404 — not a Gmail source of this workspace (an IMAP mailbox,
 * Telegram…) — and polling stops: the widget keeps its own numbers for those. A failed poll
 * keeps the last answer rather than blanking the panel.
 */
export const useImportProgress = (sourceId: number, enabled: boolean, start: boolean) => {
  const [data, setData] = useState<ImportProgress | null>(null);
  const [supported, setSupported] = useState(true);
  const inFlight = useRef(false);

  const fetchOnce = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      setData(await importProgressService.get(sourceId, start));
    } catch (error) {
      // 404: not a Gmail source (or an older backend). 401/403: this user may not read it —
      // polling a refusal every 15 s for ever helps nobody.
      const status = isAxiosError(error) ? error.response?.status : undefined;
      if (status === 404 || status === 401 || status === 403) {
        setSupported(false);
      } else {
        logger.debug('import progress poll failed', { sourceId, error });
      }
    } finally {
      inFlight.current = false;
    }
  }, [sourceId, start]);

  useEffect(() => {
    if (!enabled || !supported) return;
    void fetchOnce();
    let intervalId: number | null = null;
    const startPolling = () => {
      if (intervalId !== null) return;
      intervalId = window.setInterval(() => void fetchOnce(), IMPORT_PROGRESS_POLL_MS);
    };
    const stopPolling = () => {
      if (intervalId === null) return;
      window.clearInterval(intervalId);
      intervalId = null;
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void fetchOnce();
        startPolling();
      } else {
        stopPolling();
      }
    };
    if (document.visibilityState === 'visible') startPolling();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [enabled, supported, fetchOnce]);

  return { data, supported, refresh: fetchOnce };
};

/** A run that found at least this many messages is treated as an import (it gets a listing). */
const IMPORT_LISTING_THRESHOLD = 200;

/**
 * The processing widget's view of a Gmail import: what to show instead of the socket session's
 * counters, which reset on a backend restart and were written by two trackers in turn (the card
 * read "Complete" with ~2,100 messages still to import — taco, 2026-09-25).
 *
 * - A failed count says nothing about the import: the widget keeps the session's own view.
 * - A FINISHED import only stays on the card until the next run: a live poll afterwards shows
 *   its own numbers, not "Finished" for the run's 14-day life.
 * - The mailbox is listed only when the run looks like an import (audit pass 2): a routine poll
 *   of a quiet mailbox must not start a listing of up to 400 pages.
 */
export const useWidgetImportProgress = (session: ProcessingSession, sourceType: string) => {
  const running =
    session.isProcessing || session.status === 'started' || session.status === 'processing';
  const looksLikeImport =
    (session.emailTotal ?? session.total) >= IMPORT_LISTING_THRESHOLD ||
    session.stage === 'kb-processing' ||
    (session.kbMessagesTotal ?? 0) > 0;
  const { data, supported } = useImportProgress(
    session.integrationId,
    sourceType === 'email',
    looksLikeImport
  );
  const tracked = supported && data?.tracked ? data : null;
  const counted = tracked && tracked.run.state !== 'failed' ? tracked : null;
  const importStillRunning = counted !== null && counted.progress?.eta.state !== 'done';
  return { trackedImport: importStillRunning || !running ? counted : null, importStillRunning };
};
