import type { RunsFields, RunView } from '@/services/importProgress.service';

/**
 * A run that found fewer than this many messages stays a quiet count on the header indicator: a
 * pop-up for every routine poll trained people to close it without reading (owner, 2026-09-27).
 * Read off the backend's run record (`found`), never the socket session.
 */
export const SMALL_RUN_BELOW = 20;

/**
 * One key per problem the panel shows: a run's problem, or a failed knowledge-base thread (with
 * WHEN it failed, so the same thread failing again is a new problem).
 *
 * `overdue`: a KB mine's limit pause that is past its time with nothing bringing it back (late or
 * stuck). Its `paused` problem then ALSO carries `kb-run:paused-overdue:<episode>:<pause>`, so a
 * calm pause the person closed reopens the panel ONCE when it turns overdue (owner, 2026-10-01:
 * reopen on stuck); one closed while overdue holds both keys and stays closed if it turns calm
 * again. Keyed per PAUSE (owner decision D-R21-4), not per episode: a mine that resumes and pauses
 * again the next day writes a new pause record (kbRunLedger, a new id), and a pause closed while
 * overdue on day 1 kept a day-2 pause that turned stuck closed. `<pause>` is the record's id, or its
 * resume time if a record ever came without one.
 */
export const problemKeys = (
  fields: Pick<RunsFields, 'runs' | 'kbMiningFailures'>,
  overdue: (run: RunView) => boolean = () => false
): string[] => {
  // A clean mine is one that read something: a pause-close record is `done` with kbThreads 0 and
  // is not a mine (same rule as the backend's newest-clean-mine keep, kbRunLedger) — pass 9.
  const kbEpisode =
    fields.runs.find(
      (run) => run.channel === 'kb' && run.outcome === 'done' && (run.kbThreads ?? 0) > 0
    )?.id ?? 'none';
  return [
    ...new Set([
      // A KB mine's problem is keyed by EPISODE — since the last clean mine — not by run: the
      // history sweep retries a failing mine every 30 min, and a key per run reopened the panel each
      // time (FE audit pass 6, H2); a key per lane silenced a NEW failure after a clean mine for
      // ever (pass 7, H2). The backend keeps the newest clean mine past its 20-run trim
      // (support-service kbRunLedger), so the episode cannot change under a streak (pass 9).
      ...fields.runs.flatMap((run) =>
        run.problems.flatMap((problem) =>
          run.channel === 'kb'
            ? [
                `kb-run:${problem}:${kbEpisode}`,
                ...(problem === 'paused' && overdue(run)
                  ? [
                      `kb-run:paused-overdue:${kbEpisode}:${run.id !== '' ? run.id : (run.resumesAt ?? '')}`,
                    ]
                  : []),
              ]
            : [`run:${run.id}:${problem}`]
        )
      ),
      ...fields.kbMiningFailures.map((failure) => `kb:${failure.conversationId}:${failure.at}`),
    ]),
  ];
};

/**
 * The panel reopens by itself only for a problem the person has not closed yet. Fewer problems
 * than when they closed it (one was superseded, one dismissed) is no reason to interrupt them.
 */
export const hasUnseenProblem = (
  current: readonly string[],
  closed: readonly string[]
): boolean => {
  const seen = new Set(closed);
  return current.some((key) => !seen.has(key));
};

const closedKey = (organizationId: number, sourceId: number) =>
  `processingPanel_closedProblems_${organizationId}_${sourceId}`;

/** Storage can be full or blocked (private mode): the panel then simply reopens. */
export const readClosedProblems = (organizationId: number, sourceId: number): string[] => {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(closedKey(organizationId, sourceId)) ?? '[]'
    );
    return Array.isArray(parsed) ? parsed.filter((key) => typeof key === 'string') : [];
  } catch {
    return [];
  }
};

export const writeClosedProblems = (
  organizationId: number,
  sourceId: number,
  keys: readonly string[]
): void => {
  try {
    localStorage.setItem(closedKey(organizationId, sourceId), JSON.stringify(keys));
  } catch {
    // Not remembered: the panel reopens on the next problem check — noisy, not wrong.
  }
};
