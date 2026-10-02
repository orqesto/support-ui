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
 * How long a `resumeQueued: false` must persist, across polls, before it is passed on: the
 * backend's two 15 s caches (the runs view and the resume-job scan) can answer "no resume queued"
 * beside a pause a resume has just taken up, and every scheduled resume flashed "will not continue
 * by itself" (FE audit pass 19, LOW). 45 s covers both caches; a mine that is really stuck is
 * called so one poll later — never held back for longer than that.
 */
export const RESUME_QUEUED_CONFIRM_MS = 45_000;

/**
 * A sighting older than this is not trusted: the tab was hidden, or polls stopped, and what the
 * backend answered in between was not seen — a `false` seen before a hide must not combine with
 * one after it across an unseen `true` (FE audit pass 20, NIT). One missed poll is allowed, with
 * room for a slow answer: two polls apart plus half a poll (pass 21, NIT — at exactly two polls,
 * one failed poll and a 300 ms later answer restarted the wait).
 */
export const SIGHTING_GAP_MS = 2.5 * PROCESSING_SUMMARY_POLL_MS;

/** What the hook last saw of one source, for the pause it was seen against. */
export type ResumeQueuedSightings = Map<
  number,
  {
    pause: string;
    /** When `resumeQueued: false` was first seen in the current run of them; null: not now. */
    since: number | null;
    /** When this source was last answered for. */
    lastSeen: number;
  }
>;

/**
 * What one poll passes on, per source: `resumeQueued: false` only once it has been seen on polls
 * RESUME_QUEUED_CONFIRM_MS apart, against the same paused mine (`minePausedUntil`), with no other
 * answer and no unseen stretch in between; until then null (not known — the pause keeps the phase
 * of its time). Every other field is the backend's. Updates `sightings` in place.
 */
export const confirmResumeQueued = (
  entries: ProcessingSummaryEntry[],
  sightings: ResumeQueuedSightings,
  now: number
): ProcessingSummaryEntry[] => {
  const seen = new Set<number>();
  const confirmed = entries.map((entry) => {
    seen.add(entry.sourceId);
    // `resumeQueued` is about the paused MINE only (null when there is none), so its own pause is
    // the one the sightings are kept against.
    const pause = entry.minePausedUntil ?? '';
    const before = sightings.get(entry.sourceId);
    const same = before?.pause === pause && now - before.lastSeen <= SIGHTING_GAP_MS;
    let out = entry;
    let since: number | null = null;
    if (entry.resumeQueued === false) {
      since = same && before.since !== null ? before.since : now;
      if (now - since < RESUME_QUEUED_CONFIRM_MS) out = { ...out, resumeQueued: null };
    }
    sightings.set(entry.sourceId, { pause, since, lastSeen: now });
    return out;
  });
  for (const sourceId of [...sightings.keys()]) {
    if (!seen.has(sourceId)) sightings.delete(sourceId);
  }
  return confirmed;
};

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
  const sightings = useRef<ResumeQueuedSightings>(new Map());

  useEffect(() => {
    scope.current = organizationId;
    refused.current = false;
    sightings.current = new Map();
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
      if (scope.current === askedFor) {
        setEntries(confirmResumeQueued(next, sightings.current, Date.now()));
      }
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
