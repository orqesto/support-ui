import { AlertTriangle, CheckCircle, ChevronDown, ChevronUp, Loader2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ImportProgressPanel } from '@/components/messages/ImportProgressPanel';
import type { ProcessingSession } from '@/hooks/useEmailProcessingSessions';
import {
  IMPORT_LISTING_THRESHOLD,
  IMPORT_PROGRESS_POLL_MS,
  useImportProgress,
} from '@/hooks/useImportProgress';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import type { ImportProgress, RunView } from '@/services/importProgress.service';
import { useProcessingPanelStore } from '@/stores/processingPanelStore';
import { KbMiningFailures } from './KbMiningFailures';
import {
  hasUnseenProblem,
  problemKeys,
  readClosedProblems,
  SMALL_RUN_BELOW,
  writeClosedProblems,
} from './panelRules';
import { describePause, formatRunTime, plural, runStatusLabel } from './processingWords';
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
 * IDLE_UNMARK_MS). `unknown` is a capped import STILL importing, `stalled` means one stage made no
 * progress in 15 min while others may: neither is an end (FE audit pass 3, H-A).
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

/** A Gmail import worth showing: its listing did not fail and its stages are not all finished. */
const importShown = (
  data: ImportProgress | null
): data is Extract<ImportProgress, { tracked: true }> =>
  data !== null &&
  data.tracked &&
  data.run.state !== 'failed' &&
  (data.run.state === 'counting' || data.progress?.eta.state !== 'done');

/** Changes whenever the import moves: listing, imported count, or any stage's done count. */
const importFingerprint = (data: Extract<ImportProgress, { tracked: true }>): string =>
  [
    data.run.state,
    data.run.total ?? '',
    data.progress?.imported ?? '',
    ...(data.progress?.stages ?? []).map((stage) => stage.done),
  ].join(':');

/**
 * …and still MOVING: counting, or an estimate being measured or run down — or a `stalled` /
 * `unknown` finish whose numbers moved in the last IMPORT_IDLE_MS. A finish that stays stalled for
 * the import record's 14 days is shown (the import panel words it) but stops holding the panel
 * open (FE audit passes 2 H3, 3 H-A).
 */
const importMoving = (
  data: Extract<ImportProgress, { tracked: true }>,
  standingStill: boolean
): boolean => {
  const eta = data.progress?.eta.state;
  if (data.run.state === 'counting' || eta === 'running' || eta === 'estimating') return true;
  return !standingStill;
};

/** An earlier run that still wants attention, in one line. */
const OlderProblem = ({ run }: { run: RunView }) => {
  const detail =
    run.failed > 0
      ? run.channel === 'kb'
        ? `${plural(run.failed, 'conversation', 'conversations')} could not be mined.`
        : `${run.failed.toLocaleString()} could not be saved; the next check fetches them again.`
      : (describePause(run) ??
        (run.problems.includes('stalled')
          ? 'Work is left, and this check ended over 30 minutes ago.'
          : null));
  return (
    <li>
      {run.channel === 'kb' ? 'Knowledge-base mining' : 'Check'} at {formatRunTime(run.startedAt)}:{' '}
      {runStatusLabel(run)}
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
};

/** A KB session silent this long is not shown as running (a missed `kb:completed`). */
const KB_SILENT_MS = 20 * 60_000;

/**
 * One mail source's processing, from the database: a Gmail import's progress while one runs,
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
  const keys = useMemo(() => (data ? problemKeys(data) : []), [data]);
  const problemOpen = hasUnseenProblem(keys, closedProblems);
  const newest = data?.runs[0];
  const runs = data?.runs ?? [];
  const importOnScreen = importShown(data);

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

  // What opens the panel by itself, from the run records (newest first), once per id:
  // - a run of 20+ still running;
  // - an import-sized run (200+) that still owes work — arriving during its long tail of
  //   analysis and mining is the common case, not an edge (FE audit pass 5, M3);
  // - a tracked Gmail import still moving.
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
          (run.found >= IMPORT_LISTING_THRESHOLD && (run.active || run.workRemaining)))
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

  // Any recorded run still running or owing work — the same rule as the summary's `inProgress`;
  // reading only the newest said "Done" over an import a small run had landed on top of (FE audit
  // pass 5, H2) — and KB mining the socket reports (a re-mine has no run record, H3).
  const running =
    importMovingNow || runs.some((run) => run.active || run.workRemaining) || kbWork !== null;
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
    : !openedRun || (!openedRun.active && !openedRun.workRemaining);
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
  const statusWord = needsAttention
    ? 'Needs attention'
    : running
      ? 'Processing'
      : data === null
        ? 'Loading'
        : unknown
          ? 'Unknown'
          : importIdle
            ? 'No progress'
            : 'Done';
  // The run the panel opened for is the one it details; otherwise the newest.
  const shownRun = openedRun ?? newest;
  const otherRuns = runs.filter((run) => run !== shownRun);
  const olderWithProblems = otherRuns.filter((run) => run.problems.length > 0);
  const olderOwing = otherRuns.filter(
    (run) => run.problems.length === 0 && (run.active || run.workRemaining)
  );

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
          {needsAttention ? (
            <AlertTriangle className="w-4 h-4 shrink-0 text-warning" />
          ) : running || data === null ? (
            <Loader2 className="w-4 h-4 animate-spin shrink-0 text-muted-foreground" />
          ) : unknown || importIdle ? (
            <AlertTriangle className="w-4 h-4 shrink-0 text-muted-foreground" />
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
              needsAttention
                ? 'Close. It opens again only for a new problem; the count stays by the bell.'
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
          {importOnScreen && <ImportProgressPanel data={data} />}

          {kbWork && (
            <p className="flex gap-2 items-center text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              {kbWork}
            </p>
          )}

          {data === null ? (
            <p className="flex gap-2 items-center text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              Loading…
            </p>
          ) : data.runsUnavailable ? (
            <p className="text-xs text-warning">Recent checks could not be read just now.</p>
          ) : shownRun ? (
            <RunDetails run={shownRun} />
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
                <OlderProblem key={run.id} run={run} />
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

          {data && <RecentRuns runs={data.runs} />}
        </div>
      )}
    </div>
  );
};
