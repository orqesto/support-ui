import type { RunProblem, RunView } from '@/services/importProgress.service';
import {
  describeNextReset,
  formatUtcAndLocal,
  formatUtcDateAndLocal,
  ownWay,
  pausePhase,
  resumePhase,
  type ResumeWay,
} from '@/lib/utcClock';

/**
 * Why a run stopped before it had looked at everything it found (support-service holdReason
 * `runStopCode`). Only the codes a RUN can carry are named; an unknown one gets the generic line,
 * never a guessed cause.
 */
const STOP_REASON: Record<string, string> = {
  source_deleted: 'the mailbox was removed from Odly',
  deferred_under_load: 'the server was busy',
  run_futile: 'it stopped making progress',
  lock_lost: 'another check took over the mailbox',
  stopped_early: 'it was stopped early',
  rate_limited: 'the mail provider limited the rate of requests',
  transient_error: 'the mail provider answered with a temporary error',
  daily_limit: "Gmail's daily limit was reached",
};

/**
 * A KB mine the daily KB token limit stopped. Keyed on `stoppedBy` alone, NOT the outcome: the
 * backend records a mine that also failed some conversations as `failed` with the same
 * `stoppedBy`/`resumesAt` (kbRunLedger `outcomeOf`), and that mine is paused all the same.
 */
export const isKbLimitPause = (run: RunView): boolean =>
  run.channel === 'kb' && run.stoppedBy === 'kb_token_limit';

/**
 * Has a KB run of the same mailbox started after this run (running, finished, or the record that
 * closed the pause as not continued)? The panel's runs are one mailbox's. Then a KB-limit pause is
 * history: "resumes by itself" would promise a resume a later run already overtook (FE audit pass
 * 10, LOW). Worded as a later RUN, not a mine: a close record (kbRunLedger closeKbRunPause) is one.
 */
export const hasLaterKbRun = (run: RunView, runs: readonly RunView[]): boolean => {
  const started = Date.parse(run.startedAt);
  return runs.some(
    (other) => other !== run && other.channel === 'kb' && Date.parse(other.startedAt) > started
  );
};

/** A pause past its time that nothing is bringing back on schedule: it warns (pass 19, NIT). */
export const isOverdue = (phase: ReturnType<typeof pausePhase>): boolean =>
  phase === 'late' || phase === 'stuck';

/**
 * A KB mine's limit pause that is overdue NOW — late or stuck, not taken up by a later run (a mine
 * running on, `resumed`, or any later KB run). Only such a pause sentence is worded and styled as a
 * warning; a calm one (ahead, resuming, admitted, queued, waiting for a slot) is not (pass 21, NIT).
 */
export const isOverdueKbPause = (
  run: RunView,
  laterKbRun: boolean,
  way: ResumeWay | null | undefined,
  now: number = Date.now()
): boolean =>
  isKbLimitPause(run) &&
  run.resumed !== true &&
  !laterKbRun &&
  isOverdue(pausePhase(run.resumesAt, now, ownWay(way, run.resumesAt)));

/**
 * A MAIL run whose only work left is knowledge-base processing — its other stages are through. When
 * the daily KB limit has parked this mailbox's KB work (`kbParked`), that is what it waits for:
 * the backend still adds `stalled` 30 min after the run ended (runsView `problemsOf` has no parked
 * check), and "Work is left … ended over 30 minutes ago" under "Needs attention" sat beside the
 * import's own "Paused … continues from 00:00" (FE audit pass 17, MED P17-F2).
 */
export const isParkedByKbLimit = (run: RunView, kbParked: boolean): boolean => {
  const stages = run.stages;
  // BE R17: the backend says so itself (`kbLimitPause`, and then no `stalled`).
  if (run.kbLimitPause && run.channel !== 'kb' && !run.active) return true;
  return (
    kbParked &&
    run.channel !== 'kb' &&
    !run.active &&
    stages !== null &&
    stages.kb.done < stages.kb.queued &&
    stages.decided.done >= stages.decided.queued &&
    stages.analysis.done >= stages.analysis.queued &&
    stages.embedding.done >= stages.embedding.queued
  );
};

/** The sentence for such a run's work left, in place of the stalled one. */
export const PARKED_WORK_SENTENCE =
  'Work is left: its knowledge-base processing is paused at the daily AI limit and continues by itself after the reset.';

/**
 * BE round 21 `kbStateUnknown`: a mail run whose only work left is KB work that is not moving,
 * where whether the daily KB limit holds it is NOT KNOWN. Calm — not a problem, not a pause, not
 * "stalled". The clause after "…:" (lower case), by its reason.
 */
export const kbStateUnknownClause = (run: RunView): string =>
  run.kbStateUnknown?.reason === 'limit_unreadable'
    ? 'its knowledge-base processing is not moving, and the daily KB limit could not be checked, so whether it is holding that work is not known.'
    : 'its knowledge-base processing is not moving, and whether the daily KB limit is holding it is not known.';

/** The same, as a sentence for the run's own details. */
export const kbStateUnknownSentence = (run: RunView): string =>
  `Work is left: ${kbStateUnknownClause(run)}`;

/**
 * That sentence for one run: with the backend's own hold (BE R17 `kbLimitPause`) it names when —
 * the reset still ahead, or its parked work waking now (until `resumeWindowEnd`).
 */
export const parkedWorkSentence = (run: RunView, now: number = Date.now()): string => {
  const hold = run.kbLimitPause;
  const phase = hold ? resumePhase(hold.until, now, hold.resumeWindowEnd) : null;
  if (hold && phase === 'ahead') {
    return `Work is left: its knowledge-base processing is paused at the daily AI limit and continues by itself after ${formatUtcAndLocal(hold.until)}, or sooner once the limit is raised.`;
  }
  if (hold && phase === 'resuming') {
    return `Work is left: its knowledge-base processing was paused at the daily AI limit and is resuming, due by ${formatUtcAndLocal(hold.resumeWindowEnd)}.`;
  }
  return PARKED_WORK_SENTENCE;
};

/**
 * The KB-work line of a finished MAIL run, keyed on the backend's field (`kbLimitPause` /
 * `kbStateUnknown`) whatever the run's outcome — a check that failed some messages or was paused
 * by the provider still owes its KB work, and its own badge says nothing of it (pass 22, LOW).
 * A park the panel infers (`kbParked`) wins over "not known", as `runStatus` orders them. Null
 * when the run carries neither field (a `done` run's own KB line is chosen by its status).
 */
export const kbWorkSentence = (run: RunView, kbParked = false): string | null => {
  if (run.channel === 'kb' || run.active) return null;
  if (run.kbLimitPause) return parkedWorkSentence(run);
  if (!run.kbStateUnknown) return null;
  return isParkedByKbLimit(run, kbParked) ? parkedWorkSentence(run) : kbStateUnknownSentence(run);
};

/**
 * The one line for a run that stopped short; null when it did not. `laterKbRun`: a KB mine of the
 * same mailbox started after it (`hasLaterKbRun`).
 */
export const describePause = (
  run: RunView,
  laterKbRun = false,
  way?: ResumeWay | null
): string | null => {
  if (run.outcome !== 'paused' && !isKbLimitPause(run)) return null;
  const reason = (run.stoppedBy && STOP_REASON[run.stoppedBy]) ?? null;
  if (run.stoppedBy === 'source_deleted') {
    return 'Stopped because the mailbox was removed from Odly.';
  }
  // The daily KB token limit (backend `kb_token_limit`): the mine waits for the reset and
  // resumes by itself — "the next check" would be wrong, nothing waits on a check.
  // The line is kept on an OLDER run too, so it carries the date and, once the resume time has
  // passed, says it WAS due then — never a resume still to come.
  if (isKbLimitPause(run)) {
    // A later mine is running now (BE round 9 `resumed`): the pause is over — never "resumes by
    // itself" or "was due to resume" beside a mine that already did.
    if (run.resumed === true) {
      return 'Paused by the daily AI limit for KB processing; mining has resumed and is running now.';
    }
    // A later KB run exists (a FINISHED later mine or a close record never sets `resumed`): past
    // tense — no resume still to come is promised.
    if (laterKbRun) {
      return 'Paused by the daily AI limit for KB processing; a later KB run of this mailbox has been recorded since.';
    }
    // Passed but within RESUME_GRACE_MS: resuming on schedule (the backend spreads resumes up to
    // 30 min after the reset), not late (FE audit pass 17, MED P17-F1).
    // BE R17 (`way`, the header summary's): a limit release queued it, or it is due and waiting
    // for a free re-mine slot — neither is late.
    const at = formatUtcDateAndLocal(run.resumesAt);
    // Its OWN wake window, never the summary's latest over the mailbox (pass 18, LOW).
    const phase = pausePhase(run.resumesAt, Date.now(), ownWay(way, run.resumesAt));
    // BE R20: a resume admitted it and it is starting — never late, even past its window.
    if (phase === 'admitted') {
      return 'Paused by the daily AI limit for KB processing; mining is resuming now.';
    }
    if (phase === 'queued') {
      // A release follows any limit save that leaves nothing pausing — raised, cleared, own-key
      // enforcement off — so no cause is claimed, as the bell does (FE audit pass 18, LOW).
      return 'Paused by the daily AI limit for KB processing; a limit setting changed and mining is queued to continue.';
    }
    if (phase === 'waiting') {
      return 'Paused by the daily AI limit for KB processing; it is due to continue and waiting for a free slot.';
    }
    // Past its reset with no resume queued: it will not come back by itself — said as the
    // indicator says it, with the way out (FE audit pass 19, NIT).
    if (phase === 'stuck') {
      return 'Paused by the daily AI limit for KB processing; it has no resume queued and will not continue by itself. Re-mine the mailbox to continue.';
    }
    if (at && phase === 'late') {
      return `Paused by the daily AI limit for KB processing; it was due to resume by itself at ${at}.`;
    }
    if (phase === 'resuming') {
      return `Paused by the daily AI limit for KB processing; resuming after ${formatUtcAndLocal(run.resumesAt)}.`;
    }
    const when = at ? `after ${at}` : `after the daily reset at ${describeNextReset()}`;
    return `Paused: today’s AI limit for KB processing was reached. Mining resumes by itself ${when}.`;
  }
  const rest = leftForNextCheck(run);
  if (reason) return `Paused because ${reason}. ${rest}`;
  // `deferred` without a code: the run yielded to live mail under load (runLedger `deferred`).
  if (run.deferred) return `Paused because the server was busy. ${rest}`;
  return `Stopped before it had looked at everything. ${rest}`;
};

/**
 * How many messages a Gmail check found but stopped before reaching: found − saved − already in
 * Odly − could not be saved (support-service gmailService: duplicates = processed − saved, and a
 * failed message is not processed). Null when it cannot be told — IMAP's `found` is what it went
 * through and its duplicates are unknown — or when none is left. "The rest" alone left the reader
 * to do this sum, and a found count that does not add up read as lost mail (petro 2026-10-05: 2,470
 * found, 1,339 saved, 1,047 already in Odly — 84 left).
 */
export const notReachedCount = (run: RunView): number | null => {
  if (run.channel !== 'gmail' || run.duplicates === null) return null;
  const left = run.found - run.saved - run.duplicates - run.failed;
  return left > 0 ? left : null;
};

// Past tense: the line also describes an older check, whose next check may already have run.
const leftForNextCheck = (run: RunView): string => {
  const left = notReachedCount(run);
  return left === null
    ? 'The rest follow on the next check.'
    : `${plural(left, 'message was', 'messages were')} left for the next check.`;
};

/**
 * A KB mine the daily limit paused and a later restart could NOT continue is closed by a newer
 * `done` record with nothing read and why (support-service kbRunLedger `closeKbRunPause`). Read as
 * a plain `done` it says "Done · 0 of 0" — a clean empty mine — over an abandoned backlog.
 * `stoppedBy: null` on such a record means nothing was left in scope, which IS a clean end.
 */
const NOT_CONTINUED: Record<string, { line: string; short: string }> = {
  kb_off: {
    line: 'Stopped: the knowledge base was switched off for this mailbox — the paused mining did not continue.',
    short: 'the knowledge base was switched off',
  },
  no_kb_cutoff: {
    line: 'Stopped: no KB cutoff is set for this mailbox — the paused mining did not continue.',
    short: 'no KB cutoff is set',
  },
  source_deleted: {
    line: 'Stopped: the mailbox was removed from Odly — the paused mining did not continue.',
    short: 'the mailbox was removed',
  },
};

const notContinued = (run: RunView): { line: string; short: string } | null =>
  run.channel === 'kb' && run.outcome === 'done' && run.stoppedBy
    ? (NOT_CONTINUED[run.stoppedBy] ?? null)
    : null;

/**
 * A KB mine that ended on an error before it read any conversation — e.g. the record the backend
 * writes when a resumed mine threw before recording its run (R8 contract: `outcome: 'error'`,
 * no threads). "Read 0 of 0 conversations" and "Took 0 ms" would describe a mine that never ran.
 */
export const isKbErrorBeforeReading = (run: RunView): boolean =>
  run.channel === 'kb' &&
  run.outcome === 'error' &&
  (run.kbThreads ?? 0) === 0 &&
  (run.kbThreadsDone ?? 0) === 0;

/** The sentence for a KB mine closed without continuing its paused work; null otherwise. */
export const describeNotContinued = (run: RunView): string | null =>
  notContinued(run)?.line ?? null;

/** The short reason for the one-line run list; null when the mine was not such a close. */
export const notContinuedReason = (run: RunView): string | null => notContinued(run)?.short ?? null;

/** One sentence per problem the backend names on a run (runsView `problemsOf`). */
const PROBLEM_SENTENCE: Record<
  RunProblem,
  (run: RunView, laterKbRun: boolean, kbParked: boolean, way?: ResumeWay) => string | null
> = {
  // `failed` also stands for an `error` outcome; the run details say both when both are true.
  failed: (run) => {
    const kb = run.channel === 'kb';
    const them = run.failed === 1 ? 'it' : 'them';
    const counted =
      run.failed === 0
        ? null
        : kb
          ? `${plural(run.failed, 'conversation', 'conversations')} could not be mined. Re-mine the mailbox to read ${them} again.`
          : `${plural(run.failed, 'message', 'messages')} could not be saved; the next check fetches ${them} again.`;
    // Said as the run details and the run list say it (pass 17 follow-up, LOW).
    const errored =
      run.outcome !== 'error'
        ? null
        : isKbErrorBeforeReading(run)
          ? 'The mine stopped on an error before it read any conversation. Re-mine the mailbox to try again.'
          : kb
            ? 'The mine stopped on an error. Re-mine the mailbox to try again.'
            : 'The check stopped on an error. The next check tries again.';
    return [counted, errored].filter(Boolean).join(' ') || null;
  },
  paused: (run, laterKbRun, _kbParked, way) => describePause(run, laterKbRun, way),
  interrupted: (run) =>
    `This ${run.channel === 'kb' ? 'mine' : 'check'} stopped before it finished (for example on a restart).`,
  stalled: (run, _laterKbRun, kbParked) =>
    isParkedByKbLimit(run, kbParked)
      ? parkedWorkSentence(run)
      : `Work is left, and this ${run.channel === 'kb' ? 'mine' : 'check'} ended over 30 minutes ago.`,
};

/**
 * What an older run still wants attention for, from its CURRENT problems — never from its outcome
 * alone: a failure a later clean run superseded is history, and describing it hid the real
 * problem (staging 2026-09-30: "1 could not be saved" on a run whose only problem was `stalled`).
 */
export const describeRunProblems = (
  run: RunView,
  laterKbRun = false,
  kbParked = false,
  way?: ResumeWay
): string | null => {
  const sentences = run.problems
    .map((problem) => PROBLEM_SENTENCE[problem]?.(run, laterKbRun, kbParked, way) ?? null)
    .filter((sentence): sentence is string => sentence !== null);
  // A mine the KB limit paused that ALSO failed conversations carries only `failed`: its pause is
  // said too, once (FE audit pass 8, F8-1).
  if (run.problems.length > 0 && !run.problems.includes('paused') && isKbLimitPause(run)) {
    const pause = describePause(run, laterKbRun, way);
    if (pause) sentences.push(pause);
  }
  // A mail run with a problem that also owes KB work the limit holds, or whose hold is not known:
  // said once (a stalled-and-parked run already said it) — pass 22, LOW.
  const kbWork = run.problems.length > 0 ? kbWorkSentence(run, kbParked) : null;
  if (kbWork && !sentences.includes(kbWork)) sentences.push(kbWork);
  return sentences.length > 0 ? sentences.join(' ') : null;
};

export type RunStatus =
  | 'running'
  | 'done'
  | 'stalled'
  | 'failed'
  | 'paused'
  | 'error'
  | 'interrupted'
  | 'not_continued'
  | 'kb_paused'
  | 'kb_unknown';

/**
 * What a run's badge says. A record still `running` that the backend calls interrupted is NOT
 * running — it stopped without closing its record (a restart, a throw); saying "Running" there
 * would be the widget lying for 14 days.
 */
export const runStatus = (run: RunView, kbParked = false): RunStatus => {
  if (run.problems.includes('interrupted')) return 'interrupted';
  if (run.outcome === 'running') return run.active ? 'running' : 'interrupted';
  // Its only work left is KB work the daily limit parked: paused, not stopped moving (pass 17).
  if (run.outcome === 'done' && run.workRemaining && isParkedByKbLimit(run, kbParked)) {
    return 'kb_paused';
  }
  // BE round 21: its only work left is KB work whose hold by the limit is not known — not "Done"
  // over work left, not "Work left" (a warning): a calm "not known".
  if (run.outcome === 'done' && run.workRemaining && run.kbStateUnknown && run.channel !== 'kb') {
    return 'kb_unknown';
  }
  // Finished, but its later stages stopped moving: "Done" beside "nothing has moved" is a lie.
  if (run.outcome === 'done' && run.problems.includes('stalled')) return 'stalled';
  // "Done" over a paused mine that was never continued would read as a clean empty mine.
  if (notContinued(run)) return 'not_continued';
  return run.outcome;
};

export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  running: 'Running',
  done: 'Done',
  stalled: 'Work left',
  failed: 'Not all saved',
  paused: 'Paused',
  error: 'Error',
  interrupted: 'Did not finish',
  not_continued: 'Stopped',
  kb_paused: 'KB paused',
  kb_unknown: 'KB not known',
};

export const RUN_STATUS_VARIANT: Record<RunStatus, 'secondary' | 'success' | 'warning' | 'danger'> =
  {
    running: 'secondary',
    done: 'success',
    stalled: 'warning',
    failed: 'danger',
    paused: 'warning',
    error: 'danger',
    interrupted: 'warning',
    not_continued: 'warning',
    kb_paused: 'secondary',
    kb_unknown: 'secondary',
  };

/**
 * The badge colour of a run. A KB mine's limit pause on its way back (ahead, resuming, admitted,
 * queued, waiting for a slot), resumed, or taken up by a later run is calm — only an overdue one
 * warns, as its pause line, the panel's header and the indicator (pass 22, LOW). `laterKbRun`:
 * `hasLaterKbRun`; `way`: the mine's way back from the header summary.
 */
export const runStatusVariant = (
  run: RunView,
  status: RunStatus,
  laterKbRun = false,
  way?: ResumeWay | null
): (typeof RUN_STATUS_VARIANT)[RunStatus] =>
  status === 'paused' && isKbLimitPause(run) && !isOverdueKbPause(run, laterKbRun, way)
    ? 'secondary'
    : RUN_STATUS_VARIANT[status];

/** The badge for a run: a KB mine that failed some conversations saved no mail — "Not all mined". */
export const runStatusLabel = (run: RunView, kbParked = false): string => {
  const status = runStatus(run, kbParked);
  return run.channel === 'kb' && status === 'failed' ? 'Not all mined' : RUN_STATUS_LABEL[status];
};

/** "850 ms", "3.2 s", "2 min 5 s". */
export const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms - minutes * 60_000) / 1000);
  return seconds > 0 ? `${minutes} min ${seconds} s` : `${minutes} min`;
};

/** "14:05" today, "29 Sep, 14:05" on another day. */
export const formatRunTime = (iso: string, now: Date = new Date()): string => {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const time = at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (at.toDateString() === now.toDateString()) return time;
  return `${at.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ${time}`;
};

export const plural = (count: number, one: string, many: string): string =>
  `${count.toLocaleString()} ${count === 1 ? one : many}`;
