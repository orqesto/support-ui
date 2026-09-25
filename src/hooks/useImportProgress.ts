import { isAxiosError } from 'axios';
import { useCallback, useEffect, useRef, useState } from 'react';
import { logger } from '@/lib/logger';
import { type ImportProgress, importProgressService } from '@/services/importProgress.service';

/** Every 15 s: the backend caches its counts for 15 s and samples the rate once a minute. */
export const IMPORT_PROGRESS_POLL_MS = 15_000;

/**
 * Polls a Gmail source's import progress while `enabled`, paused while the tab is hidden.
 *
 * `supported` goes false on a 404 — not a Gmail source of this workspace (an IMAP mailbox,
 * Telegram…) — and polling stops: the widget keeps its own numbers for those. A failed poll
 * keeps the last answer rather than blanking the panel.
 */
export const useImportProgress = (sourceId: number, enabled: boolean) => {
  const [data, setData] = useState<ImportProgress | null>(null);
  const [supported, setSupported] = useState(true);
  const inFlight = useRef(false);

  const fetchOnce = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      setData(await importProgressService.get(sourceId));
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 404) {
        setSupported(false);
      } else {
        logger.debug('import progress poll failed', { sourceId, error });
      }
    } finally {
      inFlight.current = false;
    }
  }, [sourceId]);

  useEffect(() => {
    if (!enabled || !supported) return;
    void fetchOnce();
    let intervalId: number | null = null;
    const start = () => {
      if (intervalId !== null) return;
      intervalId = window.setInterval(() => void fetchOnce(), IMPORT_PROGRESS_POLL_MS);
    };
    const stop = () => {
      if (intervalId === null) return;
      window.clearInterval(intervalId);
      intervalId = null;
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void fetchOnce();
        start();
      } else {
        stop();
      }
    };
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [enabled, supported, fetchOnce]);

  return { data, supported, refresh: fetchOnce };
};
