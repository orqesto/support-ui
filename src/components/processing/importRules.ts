import { awaitingHistoryRead, isImapRun } from '@/components/messages/ImportProgressPanel';
import type { ImportProgress, StageEta } from '@/services/importProgress.service';

/**
 * A Gmail or IMAP import worth showing: its stages are not all finished and its listing did not
 * fail — except an IMAP listing that failed, which is shown with its reason and Recount (nothing
 * else on the screen would say why no progress appears). An IMAP run is not finished until its read
 * has ended (awaitingHistoryRead), whatever its eta says.
 */
export const importShown = (
  data: ImportProgress | null
): data is Extract<ImportProgress, { tracked: true }> =>
  data !== null &&
  data.tracked &&
  (data.run.state === 'failed'
    ? isImapRun(data.run)
    : data.run.state === 'counting' ||
      data.progress?.eta.state !== 'done' ||
      awaitingHistoryRead(data));

/** Changes whenever the import moves: listing, imported count, or any stage's done count. */
export const importFingerprint = (data: Extract<ImportProgress, { tracked: true }>): string =>
  [
    data.run.state,
    data.run.total ?? '',
    data.progress?.imported ?? '',
    ...(data.progress?.stages ?? []).map((stage) => stage.done),
  ].join(':');

/**
 * An eta whose finish is unknown because whether the daily KB limit holds the work is not known:
 * the limit could not be checked (BE round 20 `limit_unreadable`), or the queue's parked KB jobs
 * could not be read in full (BE round 21 `pause_unknown`).
 */
const kbHoldNotKnown = (eta: StageEta | undefined): boolean =>
  eta?.state === 'unknown' && (eta.reason === 'limit_unreadable' || eta.reason === 'pause_unknown');

/**
 * An import whose ONLY open question is whether the daily KB limit holds its work: its overall
 * finish is unknown for that reason (kbHoldNotKnown) and every stage is finished, paused or unknown
 * for that same reason. Whether it is held or moving is not known — neither "Processing" nor "No
 * progress".
 */
export const importKbHoldNotKnown = (data: Extract<ImportProgress, { tracked: true }>): boolean =>
  data.run.state !== 'counting' &&
  kbHoldNotKnown(data.progress?.eta) &&
  (data.progress?.stages ?? []).every(
    (stage) =>
      stage.eta.state === 'done' || stage.eta.state === 'paused' || kbHoldNotKnown(stage.eta)
  );

/**
 * …and still MOVING: counting, or an estimate being measured or run down — or a `stalled` /
 * `unknown` finish whose numbers moved in the last IMPORT_IDLE_MS. A finish that stays stalled for
 * the import record's 14 days is shown (the import panel words it) but stops holding the panel
 * open (FE audit passes 2 H3, 3 H-A).
 */
export const importMoving = (
  data: Extract<ImportProgress, { tracked: true }>,
  standingStill: boolean
): boolean => {
  // A failed listing moves nothing: it waits for a Recount.
  if (data.run.state === 'failed') return false;
  const eta = data.progress?.eta.state;
  if (data.run.state === 'counting' || eta === 'running' || eta === 'estimating') return true;
  if (importKbHoldNotKnown(data)) return false;
  // Parked by a daily limit with nothing else open (BE R16 eta `paused`): not moving NOW — it said
  // "Processing" with a spinner and opened itself for up to IMPORT_IDLE_MS (FE audit pass 17, LOW).
  if (
    eta === 'paused' &&
    (data.progress?.stages ?? []).every(
      (stage) => stage.eta.state === 'done' || stage.eta.state === 'paused'
    )
  ) {
    return false;
  }
  return !standingStill;
};
