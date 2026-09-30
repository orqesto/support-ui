import type { RunProblem, RunView } from '@/services/importProgress.service';

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

/** The one line for a run that stopped short; null when it did not. */
export const describePause = (run: RunView): string | null => {
  if (run.outcome !== 'paused') return null;
  const reason = (run.stoppedBy && STOP_REASON[run.stoppedBy]) ?? null;
  if (run.stoppedBy === 'source_deleted') {
    return 'Stopped because the mailbox was removed from Odly.';
  }
  if (reason) return `Paused because ${reason}. The rest follow on the next check.`;
  // `deferred` without a code: the run yielded to live mail under load (runLedger `deferred`).
  if (run.deferred) return 'Paused because the server was busy. The rest follow on the next check.';
  return 'Stopped before it had looked at everything. The rest follow on the next check.';
};

/** One sentence per problem the backend names on a run (runsView `problemsOf`). */
const PROBLEM_SENTENCE: Record<RunProblem, (run: RunView) => string | null> = {
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
    const errored =
      run.outcome !== 'error'
        ? null
        : kb
          ? 'The mine stopped on an error. Re-mine the mailbox to try again.'
          : 'The check stopped on an error. The next check tries again.';
    return [counted, errored].filter(Boolean).join(' ') || null;
  },
  paused: describePause,
  interrupted: (run) =>
    `This ${run.channel === 'kb' ? 'mine' : 'check'} stopped before it finished (for example on a restart).`,
  stalled: (run) =>
    `Work is left, and this ${run.channel === 'kb' ? 'mine' : 'check'} ended over 30 minutes ago.`,
};

/**
 * What an older run still wants attention for, from its CURRENT problems — never from its outcome
 * alone: a failure a later clean run superseded is history, and describing it hid the real
 * problem (staging 2026-09-30: "1 could not be saved" on a run whose only problem was `stalled`).
 */
export const describeRunProblems = (run: RunView): string | null => {
  const sentences = run.problems
    .map((problem) => PROBLEM_SENTENCE[problem]?.(run) ?? null)
    .filter((sentence): sentence is string => sentence !== null);
  return sentences.length > 0 ? sentences.join(' ') : null;
};

export type RunStatus =
  | 'running'
  | 'done'
  | 'stalled'
  | 'failed'
  | 'paused'
  | 'error'
  | 'interrupted';

/**
 * What a run's badge says. A record still `running` that the backend calls interrupted is NOT
 * running — it stopped without closing its record (a restart, a throw); saying "Running" there
 * would be the widget lying for 14 days.
 */
export const runStatus = (run: RunView): RunStatus => {
  if (run.problems.includes('interrupted')) return 'interrupted';
  if (run.outcome === 'running') return run.active ? 'running' : 'interrupted';
  // Finished, but its later stages stopped moving: "Done" beside "nothing has moved" is a lie.
  if (run.outcome === 'done' && run.problems.includes('stalled')) return 'stalled';
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
  };

/** The badge for a run: a KB mine that failed some conversations saved no mail — "Not all mined". */
export const runStatusLabel = (run: RunView): string => {
  const status = runStatus(run);
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
