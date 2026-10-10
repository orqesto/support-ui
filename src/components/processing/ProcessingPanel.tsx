import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Loader2,
  PauseCircle,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { kbFullHoldLine } from '@/components/settings/integrations/kbRangeCopy';
import { ImportProgressPanel, isImapRun } from '@/components/messages/ImportProgressPanel';
import type { ProcessingSession } from '@/hooks/useEmailProcessingSessions';
import {
  IMPORT_LISTING_THRESHOLD,
  IMPORT_PROGRESS_POLL_MS,
  useImportProgress,
} from '@/hooks/useImportProgress';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import {
  type ImportProgress,
  importProgressService,
  type RunView,
} from '@/services/importProgress.service';
import { useProcessingPanelStore } from '@/stores/processingPanelStore';
import {
  formatUtcDateAndLocal,
  ownWay,
  pausePhase,
  resumePhase,
  RESUME_GRACE_MS,
  type ResumeWay,
} from '@/lib/utcClock';
import { KbMiningFailures } from './KbMiningFailures';
import {
  hasUnseenProblem,
  problemKeys,
  readClosedProblems,
  SMALL_RUN_BELOW,
  writeClosedProblems,
} from './panelRules';
import { importFingerprint, importKbHoldNotKnown, importMoving, importShown } from './importRules';
import {
  describeRunProblems,
  hasLaterKbRun,
  formatRunTime,
  isKbLimitPause,
  isOverdue,
  isOverdueKbPause,
  isParkedByKbLimit,
  kbStateUnknownClause,
  plural,
  runStatusLabel,
} from './processingWords';
import { RecentRuns } from './RecentRuns';
import { RunDetails } from './RunDetails';
import { useDraggablePosition } from './useDraggablePosition';

/** A run panel closes itself this long after its run owes nothing and nothing went wrong. */
export const AUTO_CLOSE_MS = 15_000;

/**
 * A panel off screen and not watched (a problem the person closed) asks this rarely: often enough
 * that the same KB thread failing again — which leaves the header's problem count unchanged —
 * still reopens it (FE audit pass 3, M-E). Not free: each answer over an unfinished import wakes
 * the backend's import sampler for a while.
 */
export const HIDDEN_POLL_MS = 5 * 60_000;

/**
 * An import whose finish is `stalled` or `unknown` still holds the panel open until its numbers
 * have stood still this long — the backend's own rule for an import that stopped (importProgressService
 * IDLE_UNMARK_MS). A capped listing's `unknown` is an import STILL importing, `stalled` means one
 * stage made no progress in 15 min while others may: neither is an end (FE audit pass 3, H-A). An
 * `unknown` whose only cause is that whether the daily KB limit holds the work is not known — the
 * limit could not be checked (`limit_unreadable`) or the queue's parked KB jobs could not be read
 * in full (`pause_unknown`) — with nothing else open is not moving and not stopped either: it is
 * said as "Unknown" at once (importKbHoldNotKnown), never "Processing" and then "No progress"
 * (pass 21, NIT).
 */
export const IMPORT_IDLE_MS = 45 * 60_000;

const EXPANDED_KEY = 'processingPanel_expanded';

const readExpanded = (): boolean => {
  try {
    return localStorage.getItem(EXPANDED_KEY) !== 'false';
  } catch {
    return true;
  }
};

/**
 * Every resume time the panel has for this mailbox's KB work parked by the daily KB limit: the
 * import's KB stage (BE R16 eta `paused`), the socket session's pause, and a KB-limit pause record
 * nothing later has overtaken (the limit is the workspace's: a mine paused at it means the KB jobs
 * of the mail runs are held too).
 */
const kbParkTimes = (
  data: ImportProgress | null,
  runs: readonly RunView[],
  sessionPause: string | null | undefined,
  way: ResumeWay | undefined
  // Each with its wake-window end (no summary entry for the mailbox: the FE grace applies).
): { until: string; windowEnd?: string | null }[] => {
  const times: { until: string; windowEnd?: string | null }[] = [];
  if (data?.tracked && data.progress) {
    for (const stage of data.progress.stages) {
      if (stage.stage === 'kb' && stage.eta.state === 'paused') {
        times.push({ until: stage.eta.until, windowEnd: stage.eta.resumeWindowEnd });
      }
    }
    const eta = data.progress.eta;
    if (eta.state === 'paused' && eta.stage === 'kb') {
      times.push({ until: eta.until, windowEnd: eta.resumeWindowEnd });
    }
  }
  // An R17 backend stops calling such work held at its own reset + the spread, not the FE grace:
  // the panel said "KB paused" for 15 min over a run the backend had made stalled (pass 18, LOW).
  const own = (until: string) => ({ until, windowEnd: ownWay(way, until)?.resumeWindowEnd });
  // BE R17 `releaseQueuedAt`: a limit save released the pause before the reset. The mine's record
  // and the socket session keep their old reset until the mine runs again, but the limit no longer
  // holds this mailbox's KB work — the backend's own holds (import eta, `kbLimitPause`) ended at
  // once (BE R18). Kept, they read a run the backend calls stalled as "continues by itself after
  // the reset" while the indicator warned (FE audit pass 19, LOW).
  const released = !!way?.releaseQueuedAt;
  if (sessionPause && !released) times.push(own(sessionPause));
  for (const run of runs) {
    if (
      !released &&
      isKbLimitPause(run) &&
      run.resumed !== true &&
      run.resumesAt &&
      !hasLaterKbRun(run, runs)
    ) {
      times.push(own(run.resumesAt));
    }
    // BE R17: the backend itself says this mail run's KB work is held.
    if (run.kbLimitPause) {
      times.push({ until: run.kbLimitPause.until, windowEnd: run.kbLimitPause.resumeWindowEnd });
    }
  }
  return times;
};

/**
 * The phase the calm "KB paused" header stands for: the mine's own pause record when one is on
 * screen (its way back from the summary), else the summary's way back, else the parked work's
 * times — `ahead` when any of them is still to come.
 */
const pausedTitlePhase = (
  runs: readonly RunView[],
  way: ResumeWay | undefined,
  now: number,
  parkPhases: readonly ReturnType<typeof resumePhase>[]
): ReturnType<typeof pausePhase> => {
  const mine = runs.find(
    (run) =>
      isKbLimitPause(run) &&
      run.problems.includes('paused') &&
      run.resumed !== true &&
      !hasLaterKbRun(run, runs)
  );
  if (mine) return pausePhase(mine.resumesAt, now, ownWay(way, mine.resumesAt));
  if (way?.resumeAdmittedAt) return 'admitted';
  if (way?.releaseQueuedAt) return 'queued';
  return parkPhases.includes('ahead') ? 'ahead' : 'resuming';
};

/** The Close button's title over a calm "KB paused" header, true of the phase it stands for. */
const pausedCloseTitle = (
  phase: ReturnType<typeof pausePhase>,
  minePauseKeyed: boolean
): string => {
  const what =
    phase === 'admitted'
      ? 'The paused knowledge-base mining is resuming now'
      : phase === 'queued'
        ? 'A limit setting changed and the paused work is queued to continue'
        : phase === 'waiting'
          ? 'The paused work is due to continue and waits for a free slot'
          : phase === 'resuming'
            ? 'The paused work is resuming after the reset'
            : 'The paused work continues by itself after the reset';
  // Only a mine's pause record is keyed apart when it turns overdue (problemKeys).
  const again = minePauseKeyed
    ? 'it opens again for a new problem, or if the paused mine does not resume on time.'
    : 'it opens again only for a new problem.';
  return `Close. ${what}; ${again}`;
};

/** An earlier run that still wants attention, in one line. */
const OlderProblem = ({
  run,
  laterKbRun,
  kbParked,
  resumeWay,
}: {
  run: RunView;
  laterKbRun: boolean;
  kbParked: boolean;
  resumeWay?: ResumeWay;
}) => {
  const detail = describeRunProblems(run, laterKbRun, kbParked, resumeWay);
  // A KB-limit pause and nothing else, on its way back or taken up by a later run: calm, not in
  // the list's warning colour — only an overdue one warns (pass 21, NIT).
  const calm =
    isKbLimitPause(run) &&
    run.problems.every((problem) => problem === 'paused') &&
    !isOverdueKbPause(run, laterKbRun, resumeWay);
  return (
    <li className={calm ? 'text-muted-foreground' : undefined}>
      {run.channel === 'kb' ? 'Knowledge-base mining' : 'Check'} at {formatRunTime(run.startedAt)}:{' '}
      {runStatusLabel(run, kbParked)}
      {detail ? `. ${detail}` : '.'}
    </li>
  );
};

type Props = {
  organizationId: number;
  sourceId: number;
  name: string;
  /** The socket session on this source, if any: only for the KB mining line (a re-mine). */
  session?: ProcessingSession;
  /** A mail fetch is live here (socket): poll at the on-screen pace to see its run start. */
  watched?: boolean;
  /** The header summary's numbers for this source: a change makes a panel off screen ask again. */
  summaryKey?: string;
  /** The paused mine's way back, from the header summary (undefined: no entry for this mailbox). */
  resumeWay?: ResumeWay;
};

/** A KB session silent this long is not shown as running (a missed `kb:completed`). */
const KB_SILENT_MS = 20 * 60_000;

/**
 * One mail source's processing, from the database: a mail source's tracked import (Gmail or IMAP) while one runs,
 * the latest recorded run (stages over exactly the messages it saved, and what went wrong), the
 * knowledge-base threads that could not be mined, and the recent runs.
 *
 * Shown while (a) the newest recorded run is still running and found 20+ messages — identified by
 * its RUN ID, so closing it, its KB tail and any late event cannot bring it back, and it closes
 * itself once that run owes nothing; (b) the person opened it; (c) the source has a problem the
 * person has not closed yet. A problem panel never closes by itself; closing it remembers WHICH
 * problems it showed, so only a new one reopens it.
 */
export const ProcessingPanel = ({
  organizationId,
  sourceId,
  name,
  session,
  watched = false,
  summaryKey = '',
  resumeWay,
}: Props) => {
  const openPanel = useProcessingPanelStore((state) => state.opened[sourceId]);
  const closedRuns = useProcessingPanelStore((state) => state.closedRuns[sourceId]);
  const open = useProcessingPanelStore((state) => state.open);
  const close = useProcessingPanelStore((state) => state.close);
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [expanded, setExpanded] = useState(readExpanded);
  const [closedProblems, setClosedProblems] = useState(() =>
    readClosedProblems(organizationId, sourceId)
  );

  // On-screen or watched pace, else the slow pace (FE audit pass 2 M1, pass 3 M-E). It asks again
  // at once when the header summary for this source moves.
  const [fastPace, setFastPace] = useState(true);
  // A run that big is an import: only then, and only while it runs, is the mailbox listed (audit
  // pass 2; not sticky — FE audit pass 5, L4). Never from socket numbers.
  const [askListing, setAskListing] = useState(false);
  const { data, supported, refresh } = useImportProgress(
    sourceId,
    true,
    askListing,
    fastPace ? IMPORT_PROGRESS_POLL_MS : HIDDEN_POLL_MS
  );
  // A KB-limit pause of a mine that is overdue — late, or stuck with no resume queued — is keyed
  // apart, per pause, so a calm pause the person closed reopens once when it turns overdue (owner
  // decisions 2026-10-01 and D-R21-4). Not a pause a later KB run overtook or a mine that resumed.
  const keys = useMemo(
    () =>
      data
        ? problemKeys(data, (run) =>
            isOverdueKbPause(run, hasLaterKbRun(run, data.runs), resumeWay)
          )
        : [],
    [data, resumeWay]
  );
  const problemOpen = hasUnseenProblem(keys, closedProblems);
  const newest = data?.runs[0];
  const runs = data?.runs ?? [];
  const importOnScreen = importShown(data);
  // The daily KB limit holds this mailbox's KB work now — until each resume time plus the grace
  // (RESUME_GRACE_MS): a mail run owing only that work is paused, not processing or stalled.
  const now = Date.now();
  const kbParkPhases = kbParkTimes(data, runs, session?.kbPausedUntil, resumeWay).map(
    ({ until, windowEnd }) => resumePhase(until, now, windowEnd)
  );
  const kbParked = kbParkPhases.some((phase) => phase === 'ahead' || phase === 'resuming');
  // BE round 21: a mail run whose only owed KB work may be held — and that cannot be told
  // (`kbStateUnknown`) — is not processing either: the summary leaves it out of `inProgress`.
  const kbStateUnknownOf = (run: RunView) =>
    run.workRemaining && !!run.kbStateUnknown && !isParkedByKbLimit(run, kbParked);
  // BE-6: a mail run whose only owed work a full knowledge base holds — waiting for room, not
  // processing, not stalled.
  const kbFullHeldOf = (run: RunView) =>
    run.workRemaining && !!run.kbFullHold && !isParkedByKbLimit(run, kbParked);
  const owesUnparked = (run: RunView) =>
    run.workRemaining &&
    !isParkedByKbLimit(run, kbParked) &&
    !kbStateUnknownOf(run) &&
    !kbFullHeldOf(run);

  // Mail only: a KB mine reads what is already in Odly — it is no reason to list the mailbox.
  const importSized = runs.some(
    (run) => run.active && run.channel !== 'kb' && run.found >= IMPORT_LISTING_THRESHOLD
  );
  useEffect(() => {
    setAskListing(importSized);
  }, [importSized]);

  // The import has not moved for IMPORT_IDLE_MS. Remembered per tab (sessionStorage) with the
  // numbers it stood at, so a panel mounted again — every big run on that mailbox mounts one —
  // does not restart the clock and call a days-old stalled import "Processing" (FE audit pass 4,
  // M3). A timer, not arithmetic in render: identical polls re-render nothing.
  const [standingStill, setStandingStill] = useState(false);
  const fingerprint = importOnScreen ? importFingerprint(data) : '';
  // Per browser and per import (its start), so a new tab does not restart it either (FE audit
  // pass 5, M2); a new import on the source starts its own clock.
  const stillKey = importOnScreen
    ? `processingPanel_importStill_${organizationId}_${sourceId}_${data.run.startedAt}`
    : '';
  useEffect(() => {
    setStandingStill(false);
    if (!fingerprint || !stillKey) return;
    let since = Date.now();
    try {
      const saved = JSON.parse(localStorage.getItem(stillKey) ?? 'null') as {
        fp?: unknown;
        since?: unknown;
      } | null;
      if (saved?.fp === fingerprint && typeof saved.since === 'number') since = saved.since;
      else localStorage.setItem(stillKey, JSON.stringify({ fp: fingerprint, since }));
    } catch {
      // Not remembered: the clock starts now.
    }
    const timer = window.setTimeout(
      () => setStandingStill(true),
      Math.max(0, since + IMPORT_IDLE_MS - Date.now())
    );
    return () => window.clearTimeout(timer);
  }, [fingerprint, stillKey]);
  const importMovingNow = importOnScreen && importMoving(data, standingStill);
  const importIdle = importOnScreen && !importMovingNow;
  // Its only open question is whether the KB limit holds it: whether it moves is not known (F7).
  const importUnknown = importIdle && importKbHoldNotKnown(data);

  // What opens the panel by itself, from the run records (newest first), once per id:
  // - a run of 20+ still running;
  // - an import-sized run (200+) that still owes work — arriving during its long tail of
  //   analysis and mining is the common case, not an edge (FE audit pass 5, M3);
  // - a tracked mail import (Gmail or IMAP) still moving.
  // Not while the person has closed the panel on the import still moving: its chunks are new
  // runs, and each popped it again (FE audit pass 6, M1) — mail runs only: a KB mine is not a
  // chunk of that import (pass 7, MED). Closed runs outlive a reload (processingPanelStore —
  // pass 6, H1). A KB mine opens it unless the mine just before it did not finish clean: that is
  // the history sweep RETRYING a failing mine every 30 min, which must not pop it each time
  // (pass 6, H2) — while KB switched off and on again, after a clean mine, must (pass 7, H1).
  const importId = importOnScreen ? `import:${data.run.startedAt}` : null;
  const importClosed = importMovingNow && importId !== null && closedRuns?.includes(importId);
  const kbRuns = runs.filter((run) => run.channel === 'kb');
  const kbRetry = (run: RunView): boolean => {
    const before = kbRuns[kbRuns.indexOf(run) + 1];
    return before !== undefined && before.outcome !== 'done' && before.outcome !== 'running';
  };
  const opener =
    runs.find(
      (run) =>
        (run.channel === 'kb' ? !kbRetry(run) : !importClosed) &&
        ((run.active && run.found >= SMALL_RUN_BELOW) ||
          (run.found >= IMPORT_LISTING_THRESHOLD && (run.active || owesUnparked(run))))
    )?.id ?? (importMovingNow && !importClosed ? importId : null);
  useEffect(() => {
    if (opener && openPanel === undefined && !closedRuns?.includes(opener)) {
      open(sourceId, 'run', opener);
    }
  }, [opener, openPanel, closedRuns, open, sourceId]);

  // Knowledge-base mining the socket reports on this mailbox — for a backend that does not record
  // KB runs yet (support-service feat/kb-mining-runs); hidden beside one that does.
  // Cumulative over the tracker's session, so worded as the mailbox's, not this check's; hidden
  // once silent for 20 min (a missed `kb:completed` — FE audit pass 4, M5).
  // Not beside a KB run the backend records (it says the same, from the mine's own numbers).
  const kbRunLive = runs.some((run) => run.channel === 'kb' && run.active);
  const kbWork =
    !kbRunLive &&
    session?.stage === 'kb-processing' &&
    session.isProcessing &&
    (session.kbMessagesTotal ?? 0) > 0 &&
    Date.now() - (session.updatedAt ?? session.timestamp ?? 0) < KB_SILENT_MS
      ? `Knowledge-base mining on this mailbox: ${(session.kbMessagesProcessed ?? 0).toLocaleString()} of ${(session.kbMessagesTotal ?? 0).toLocaleString()} messages`
      : null;

  // Past its resume instant the line says it is resuming, and once the wake window is over (the
  // reset + the spread; no summary entry: the grace) it goes — it went AT the instant, so the header read
  // "Done" until the first `kb:progress` (FE audit pass 18, NIT). A clock re-renders the panel at
  // each boundary; a later render reads it again.
  const kbPausedUntil = session?.kbPausedUntil;
  const kbPausedUntilMs = kbPausedUntil ? Date.parse(kbPausedUntil) : Number.NaN;
  const kbPausedWindowEnd = ownWay(resumeWay, kbPausedUntil)?.resumeWindowEnd;
  const kbPausedEndMs = kbPausedWindowEnd
    ? Date.parse(kbPausedWindowEnd)
    : kbPausedUntilMs + RESUME_GRACE_MS;
  const [clockNow, setClockNow] = useState(() => Date.now());
  useEffect(() => {
    if (Number.isNaN(kbPausedUntilMs)) return undefined;
    const at = Date.now();
    const next = [kbPausedUntilMs, kbPausedEndMs].find((boundary) => boundary > at);
    if (next === undefined) {
      // Guarded: once `clockNow` is past the end, setting it again would loop.
      if (clockNow < kbPausedEndMs) setClockNow(at);
      return undefined;
    }
    const timer = window.setTimeout(
      () => setClockNow(Date.now()),
      Math.min(next - at + 1, 2 ** 31 - 1)
    );
    return () => window.clearTimeout(timer);
  }, [kbPausedUntilMs, kbPausedEndMs, clockNow]);
  // `clockNow` alone (the effect sets it at once when a boundary is already past): the panel
  // also re-renders on its polls, which must not be what moves the line.
  const kbPauseCurrent = !Number.isNaN(kbPausedUntilMs) && clockNow < kbPausedEndMs;
  const kbPauseResuming = kbPauseCurrent && clockNow >= kbPausedUntilMs;

  // Any recorded run still running or owing work — the same rule as the summary's `inProgress`;
  // reading only the newest said "Done" over an import a small run had landed on top of (FE audit
  // pass 5, H2) — and KB mining the socket reports (a re-mine has no run record, H3).
  const running =
    importMovingNow || runs.some((run) => run.active || owesUnparked(run)) || kbWork !== null;
  const visible = supported && (openPanel !== undefined || problemOpen);

  useEffect(() => {
    setFastPace(visible || watched || data === null);
  }, [visible, watched, data]);

  const lastSummaryKey = useRef(summaryKey);
  useEffect(() => {
    if (lastSummaryKey.current === summaryKey) return;
    lastSummaryKey.current = summaryKey;
    void refresh();
  }, [summaryKey, refresh]);

  const { position, dragging, onMouseDown } = useDraggablePosition(
    `processingPanel_position_${sourceId}`,
    !isMobile
  );

  // A run panel goes once ITS run owes nothing (or has left a READABLE view). Never while the view
  // is unknown or unreadable — one failed read closed a live run's panel for good (FE audit pass 5,
  // M1) — never while an import still moves, never with a problem the person has not closed (the
  // panel is mounted for a problem only once the lagging summary counts it).
  const openedRun = openPanel?.runId ? runs.find((run) => run.id === openPanel.runId) : undefined;
  const runOver = openPanel?.runId?.startsWith('import:')
    ? !importMovingNow
    : // A run whose only work left the KB limit holds is over too: its panel stayed up all night
      // (FE audit pass 18, LOW) — the same rule that keeps such a run from opening one.
      !openedRun || (!openedRun.active && !owesUnparked(openedRun));
  const settled =
    data !== null && !data.runsUnavailable && runOver && !importMovingNow && !problemOpen;
  useEffect(() => {
    if (openPanel?.reason !== 'run' || !settled) return;
    const runId = openPanel.runId;
    const timer = window.setTimeout(() => close(sourceId, runId), AUTO_CLOSE_MS);
    return () => window.clearTimeout(timer);
  }, [openPanel, settled, close, sourceId]);

  useEffect(() => {
    try {
      localStorage.setItem(EXPANDED_KEY, String(expanded));
    } catch {
      // Not remembered.
    }
  }, [expanded]);

  if (!visible) return null;

  const handleClose = () => {
    // The run it opened for is not reopened for — nor is the one that would open it now, nor
    // (while it moves) the import it belongs to.
    if (importMovingNow && importId) close(sourceId, importId);
    if (opener && opener !== openPanel?.runId) close(sourceId, opener);
    close(sourceId, openPanel?.runId ?? opener);
    if (keys.length > 0) {
      writeClosedProblems(organizationId, sourceId, keys);
      setClosedProblems(keys);
    }
  };

  const needsAttention = keys.length > 0;
  // "Done" only on an answer that says so: not before the first answer, not when the runs could
  // not be read, not over an import that is stalled or whose finish is unknown (FE audit pass 4,
  // M4) — that one stopped holding the panel open, it did not finish.
  const unknown = !running && !needsAttention && (data === null || data.runsUnavailable);
  // The run the panel opened for is the one it details; otherwise the newest.
  const shownRun = openedRun ?? newest;
  const otherRuns = runs.filter((run) => run !== shownRun);
  const olderWithProblems = otherRuns.filter((run) => run.problems.length > 0);
  const olderOwing = otherRuns.filter(
    (run) => run.problems.length === 0 && (run.active || run.workRemaining)
  );

  // The socket session paused at the daily KB limit (`kb:completed` with `paused`): progress kept,
  // with when it resumes — not "complete". Left to the run record only when a line ON SCREEN
  // already says so: the detailed run's pause line, or an older run's paused problem. A record
  // whose pause was since closed (`problems: []`, off screen) says nothing, so it must not silence
  // this line (FE audit pass 7, MED).
  // Whatever the outcome: a mine that also failed conversations (`failed`) says its pause in its
  // details and in the older-run line alike (FE audit pass 8, F8-1).
  // A record marked `resumed` (BE round 9) means a later mine is carrying the paused work on NOW:
  // "Paused — resumes from …" would then be false, whether or not that record is on screen — so it
  // counts as the pause being said (FE audit pass 10, NIT).
  const kbPausedSaid =
    (shownRun !== undefined && isKbLimitPause(shownRun)) ||
    olderWithProblems.some(isKbLimitPause) ||
    runs.some((run) => run.resumed === true);
  // Since BE round 9 a session's total leaves out the jobs the limit parked, so it can equal the
  // processed count: "40 of 40" would read as all mined. Then only the processed count is said.
  const kbPausedDone = session?.kbMessagesProcessed ?? 0;
  const kbPausedTotal = session?.kbMessagesTotal ?? 0;
  // A force-ended session (timeout / manual, BE R12 B(b)): total − processed counts jobs that never
  // reported, not parked work — so no "N of M … resumes", and the force-end is said (pass 13, LOW).
  const kbStoppedEarly = session?.kbPauseStoppedEarly;
  const kbPaused =
    !kbPausedSaid && session && kbPauseCurrent
      ? `Knowledge-base mining on this mailbox: ${
          kbStoppedEarly !== undefined
            ? `${plural(kbPausedDone, 'message', 'messages')} processed; this run ${
                kbStoppedEarly === 'timeout' ? 'timed out' : 'was stopped'
              } before every message reported. Work paused at today’s AI limit resumes`
            : kbPausedTotal > kbPausedDone
              ? `${kbPausedDone.toLocaleString()} of ${kbPausedTotal.toLocaleString()} messages. Paused — resumes`
              : kbPausedDone === 0
                ? // BE R13 B: a poll's session that took the day's carried pause and found no KB
                  // work ends paused at 0 of 0 — that count is the poll's, not the mailbox's, and
                  // "0 processed … the rest" is untrue of it (FE audit pass 14, LOW).
                  `paused at today’s AI limit. Parked work resumes`
                : `${plural(kbPausedDone, 'message', 'messages')} processed. Paused at today’s AI limit — the rest resume`
        } from ${formatUtcDateAndLocal(kbPausedUntil) ?? '00:00 UTC'}${kbPauseResuming ? '; resuming now' : ''}.`
      : null;

  // A KB pause line on screen with nothing else to say is "KB paused", never "Done" beside a green
  // check (FE audit pass 14, LOW): the paused session is no longer processing, so it fell through.
  // "KB paused", not a bare "Paused": mail checks of this mailbox keep running (pass 16, NIT).
  // A run RECORD paused at the KB limit (`problems: ['paused']`, BE runsView) is "KB paused": the
  // summary counts it apart from problems (`pausedByLimit`) and the indicator says "paused" too
  // (FE audit pass 16, 2 LOW). Calm only when that is ALL there is (pass 15): no other problem, no
  // conversation the mine failed,
  // not overtaken by a later KB run (history then), and its resume time not yet past — a resume
  // that never came warns here as on the indicator.
  // A mail run whose only work left is KB work the limit parked carries the backend's `stalled`
  // after 30 min (BE 44f0f921 runsView): that is the same pause, not a fault (pass 17, P17-F2).
  // Its resume time "late" only past RESUME_GRACE_MS (pass 17, P17-F1).
  const problemRuns = data ? data.runs.filter((run) => run.problems.length > 0) : [];
  const limitPauseOnly =
    needsAttention &&
    data !== null &&
    data.kbMiningFailures.length === 0 &&
    problemRuns.length > 0 &&
    problemRuns.every(
      (run) =>
        (isKbLimitPause(run) &&
          run.problems.every((problem) => problem === 'paused') &&
          !hasLaterKbRun(run, runs) &&
          !isOverdue(pausePhase(run.resumesAt, now, ownWay(resumeWay, run.resumesAt)))) ||
        (isParkedByKbLimit(run, kbParked) && run.problems.every((problem) => problem === 'stalled'))
    );
  const attention = needsAttention && !limitPauseOnly;
  // An import the daily limit parked (BE R16 eta `paused`) that stopped moving: paused, not "No
  // progress" — its eta line says when it continues.
  const importPaused = importIdle && data?.progress?.eta.state === 'paused';
  const parkedOwing = runs.some((run) => run.workRemaining && isParkedByKbLimit(run, kbParked));
  // BE round 21: nothing else to say but a run whose KB work's hold is not known ⇒ "Unknown", never
  // "Done" over work left, nor "Processing" (it is not moving) or "Needs attention" (no problem).
  const runKbHoldUnknown = runs.some(kbStateUnknownOf);
  // ONE "not known" for both sources — the import's KB stage and a run's KB work: one place in the
  // order (after a known pause), one icon, one Close title (pass 22, NIT).
  const kbHoldUnknown = importUnknown || runKbHoldUnknown;
  const paused = kbPaused !== null || limitPauseOnly || importPaused || parkedOwing;
  const kbFullHeld = runs.some(kbFullHeldOf);
  const statusWord = attention
    ? 'Needs attention'
    : running
      ? 'Processing'
      : data === null
        ? 'Loading'
        : unknown
          ? 'Unknown'
          : importIdle && !importPaused && !importUnknown
            ? 'No progress'
            : paused
              ? 'KB paused'
              : kbFullHeld
                ? 'KB full'
                : kbHoldUnknown
                  ? 'Unknown'
                  : 'Done';

  return (
    <div
      role="region"
      aria-label={`Processing: ${name}`}
      data-testid="processing-panel"
      className={
        isMobile
          ? 'pointer-events-auto w-full rounded-t-lg border-t shadow-2xl border-x bg-card text-card-foreground'
          : 'pointer-events-auto w-80 rounded-lg border shadow-2xl bg-card text-card-foreground'
      }
      style={
        position
          ? { position: 'fixed', left: position.xPos, top: position.yPos, zIndex: 50 }
          : undefined
      }
    >
      <div
        className={
          isMobile
            ? 'flex justify-between items-center px-3 py-2 border-b select-none bg-muted/30'
            : `flex justify-between items-center p-3 border-b select-none bg-muted/30 ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`
        }
        // A drag handle for the mouse only; the panel's controls are its buttons.
        role="presentation"
        onMouseDown={onMouseDown}
        title={isMobile ? undefined : 'Drag to move'}
      >
        <div className="flex flex-1 gap-2 items-center min-w-0">
          {attention ? (
            <AlertTriangle className="w-4 h-4 shrink-0 text-warning" />
          ) : running || data === null ? (
            <Loader2 className="w-4 h-4 animate-spin shrink-0 text-muted-foreground" />
          ) : unknown || (importIdle && !importPaused && !importUnknown) ? (
            <AlertTriangle className="w-4 h-4 shrink-0 text-muted-foreground" />
          ) : paused || kbFullHeld ? (
            <PauseCircle className="w-4 h-4 shrink-0 text-muted-foreground" />
          ) : kbHoldUnknown ? (
            <HelpCircle className="w-4 h-4 shrink-0 text-muted-foreground" />
          ) : (
            <CheckCircle className="w-4 h-4 shrink-0 text-success" />
          )}
          <span className="text-sm font-semibold truncate" title={name}>
            {name}
          </span>
          <span className="text-[10px] text-muted-foreground shrink-0" data-testid="panel-status">
            {statusWord}
          </span>
        </div>
        <div className="flex gap-1 items-center">
          <Button
            aria-label={expanded ? 'Hide details' : 'Show details'}
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((value) => !value)}
            className="p-0 w-6 h-6"
          >
            {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
          </Button>
          <Button
            aria-label="Close"
            variant="ghost"
            size="sm"
            onClick={handleClose}
            className="p-0 w-6 h-6"
            title={
              // Calm "KB paused": no count by the bell, and the pause is not a problem (pass 17).
              // Worded from the pause's phase: "after the reset" was false for a release-queued
              // mine and for one resuming past the reset (FE audit pass 20, LOW).
              statusWord === 'KB paused'
                ? pausedCloseTitle(
                    pausedTitlePhase(runs, resumeWay, now, kbParkPhases),
                    keys.some((key) => key.startsWith('kb-run:paused:'))
                  )
                : needsAttention
                  ? 'Close. It opens again only for a new problem; the count stays by the bell.'
                  : statusWord === 'KB full'
                    ? 'Close. The note by the bell stays while the knowledge base is full.'
                    : statusWord === 'Unknown' && !unknown && kbHoldUnknown
                      ? // Nothing is processing and there is no count. Only a RUN whose hold is not
                        // known is counted by the bell (summary `kbStateUnknown`); an import's KB
                        // stage is not, so the note is promised only for the run.
                        runKbHoldUnknown
                        ? 'Close. The note by the bell stays while it is not known whether the daily KB limit holds this work.'
                        : 'Close. It is not known whether the daily KB limit holds this work; nothing is counted by the bell for it.'
                      : 'Close. Processing carries on; the count stays by the bell.'
            }
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {expanded && (
        <div
          className={
            isMobile
              ? 'overflow-y-auto p-2 space-y-2 max-h-[60vh]'
              : 'overflow-y-auto p-3 space-y-3 max-h-96'
          }
        >
          {importOnScreen && (
            <ImportProgressPanel
              data={data}
              onRecount={
                isImapRun(data.run) ? () => importProgressService.recount(sourceId) : undefined
              }
              onRecounted={() => refresh()}
            />
          )}

          {kbWork && (
            <p className="flex gap-2 items-center text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              {kbWork}
            </p>
          )}

          {kbPaused && <p className="text-xs text-muted-foreground">{kbPaused}</p>}

          {data === null ? (
            <p className="flex gap-2 items-center text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              Loading…
            </p>
          ) : data.runsUnavailable ? (
            <p className="text-xs text-warning">Recent checks could not be read just now.</p>
          ) : shownRun ? (
            <RunDetails
              run={shownRun}
              laterKbRun={hasLaterKbRun(shownRun, runs)}
              kbParked={kbParked}
              resumeWay={resumeWay}
              newest={shownRun === newest}
              sourceId={sourceId}
              onRetried={() => void refresh()}
            />
          ) : (
            !importOnScreen &&
            !kbWork && (
              <p className="text-xs text-muted-foreground">No recent check found new mail.</p>
            )
          )}

          {olderOwing.length > 0 && (
            <ul className="pt-2 space-y-0.5 text-[11px] border-t text-muted-foreground">
              {olderOwing.map((run) =>
                run.channel === 'kb' ? (
                  <li key={run.id}>
                    Knowledge-base mining at {formatRunTime(run.startedAt)} is still going.
                  </li>
                ) : isParkedByKbLimit(run, kbParked) ? (
                  <li key={run.id}>
                    Check at {formatRunTime(run.startedAt)} ({run.found.toLocaleString()} found):
                    its knowledge-base processing is paused at the daily AI limit.
                  </li>
                ) : kbFullHeldOf(run) ? (
                  <li key={run.id} data-testid="older-kb-full">
                    Check at {formatRunTime(run.startedAt)} ({run.found.toLocaleString()} found):{' '}
                    {kbFullHoldLine(run.kbFullHold?.owedThreads ?? 0)}
                  </li>
                ) : kbStateUnknownOf(run) ? (
                  <li key={run.id} data-testid="older-kb-unknown">
                    Check at {formatRunTime(run.startedAt)} ({run.found.toLocaleString()} found):{' '}
                    {kbStateUnknownClause(run)}
                  </li>
                ) : (
                  <li key={run.id}>
                    Check at {formatRunTime(run.startedAt)} ({run.found.toLocaleString()} found) is
                    still being processed.
                  </li>
                )
              )}
            </ul>
          )}

          {olderWithProblems.length > 0 && (
            <ul className="pt-2 space-y-0.5 text-[11px] border-t text-warning">
              {olderWithProblems.map((run) => (
                <OlderProblem
                  key={run.id}
                  run={run}
                  laterKbRun={hasLaterKbRun(run, runs)}
                  kbParked={kbParked}
                  resumeWay={resumeWay}
                />
              ))}
            </ul>
          )}

          {data?.countCapped && (
            <p className="text-[11px] text-muted-foreground">
              Some older checks were not counted, so there may be more work left than shown.
            </p>
          )}

          {data && (
            <KbMiningFailures
              sourceId={sourceId}
              failures={data.kbMiningFailures}
              truncated={data.kbMiningFailuresTruncated}
              onDismissed={() => void refresh()}
            />
          )}

          {data && <RecentRuns runs={data.runs} kbParked={kbParked} resumeWay={resumeWay} />}
        </div>
      )}
    </div>
  );
};
