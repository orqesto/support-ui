/**
 * The one way a daily-limit time is written: "00:00 UTC (02:00 your time)".
 *
 * The limits reset at a UTC midnight and a paused mine resumes a few minutes after it; the
 * reader is rarely in UTC. Both clocks are shown so neither can be mistaken for the other, and
 * the UTC part is the instant's own UTC time (a resume at 00:12 UTC says 00:12, not 00:00).
 */
const pad = (value: number): string => String(value).padStart(2, '0');

export const formatUtcAndLocal = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const utc = `${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())} UTC`;
  const local = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  return `${utc} (${local} your time)`;
};

/**
 * "00:00 UTC on 2026-10-01 (02:00 your time)" — for an instant that may not be today, where the
 * clock alone would leave the reader guessing which day.
 */
export const formatUtcDateAndLocal = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const utc = `${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())} UTC`;
  const local = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  const utcDate = at.toISOString().slice(0, 10);
  const localDate = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  // The reader's own date when it is another day there: "23:30 UTC on 2026-09-30 (01:30 your
  // time)" read 01:30 on the 30th for a reader two hours ahead (FE audit pass 9, NIT).
  const localDay = localDate === utcDate ? '' : ` on ${localDate}`;
  return `${utc} on ${utcDate} (${local}${localDay} your time)`;
};

/** The reset instant when the backend did not send one: the next 00:00 UTC, in the same style. */
export const nextUtcMidnight = (now: Date = new Date()): string =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();

/** "00:00 UTC (02:00 your time)" for the next reset — used when no instant was sent. */
export const describeNextReset = (now: Date = new Date()): string =>
  formatUtcAndLocal(nextUtcMidnight(now)) ?? '00:00 UTC';

/**
 * How long after a pause's resume time it is still RESUMING, not late. The backend's `pausedUntil`
 * / `resumesAt` / eta `until` is the reset instant itself (nextBudgetReset), but the resumed mine is
 * spread 0–30 min after it (KB_RESUME_SPREAD_MS) and may then wait for a re-mine slot; parked KB
 * jobs wake up over the same spread. Calling it overdue at the instant warned on every reset for
 * work resuming on schedule (FE audit pass 17, MED P17-F1). ONE constant for the indicator, the
 * panel and every pause sentence, so they never disagree about which side of it they are on.
 */
export const RESUME_GRACE_MS = 45 * 60_000;

/** `ahead`: still to come; `resuming`: passed, within the grace; `late`: past the grace. */
export type ResumePhase = 'ahead' | 'resuming' | 'late';

/** Where `iso` (a pause's resume time) stands at `now`; null when there is no readable time. */
export const resumePhase = (
  iso: string | null | undefined,
  now: number = Date.now(),
  windowEnd?: string | null
): ResumePhase | null => {
  const at = iso ? Date.parse(iso) : Number.NaN;
  if (Number.isNaN(at)) return null;
  if (at > now) return 'ahead';
  // `resumeWindowEnd`: the end of the wake spread of this pause — the reset + 30 min, or for KB jobs
  // found parked in the queue the latest one's due time. Absent (no summary entry) or unreadable:
  // the FE grace stands in for it.
  const end = windowEnd ? Date.parse(windowEnd) : Number.NaN;
  return now < (Number.isNaN(end) ? at + RESUME_GRACE_MS : end) ? 'resuming' : 'late';
};

/**
 * How a mine paused at the KB limit is on its way back (processing summary). Each null = not
 * known (no paused mine, or the queue could not be read).
 */
export type ResumeWay = {
  resumeWindowEnd?: string | null;
  /**
   * The paused mine's `resume-kb-mine` job is still queued; `false`: a mine is counted and no
   * resume of it is queued — past its reset it will not come back by itself (pass 18, LOW).
   */
  resumeQueued?: boolean | null;
  /** Due and waiting for a free re-mine slot: waiting its turn, never late. */
  waitingForSlot?: boolean | null;
  /** When a limit release queued the mine to continue. */
  releaseQueuedAt?: string | null;
  /**
   * BE R20: when a resume ADMITTED the paused mine — set only while that admission is newer than
   * the pause and the mine's running record has not replaced it. The mine is starting: "resuming
   * now", never late or stuck, whatever the clock says (a slot wait can admit it past its window).
   */
  resumeAdmittedAt?: string | null;
};

/**
 * The phase of a pause with what the backend knows of its way back: `admitted` when a resume
 * admitted the mine and it is starting now (before or past its time), `queued` when a limit release
 * queued it, `waiting` when it is past its resume time and waiting for a slot, `stuck` when it is
 * past its resume time with no resume of it queued; else resumePhase.
 */
export const pausePhase = (
  iso: string | null | undefined,
  now: number,
  way: ResumeWay | null | undefined
): ResumePhase | 'admitted' | 'queued' | 'waiting' | 'stuck' | null => {
  // BE R20 `resumeAdmittedAt`: the newest fact — the mine is starting. Before the release line: a
  // released mine that was admitted is no longer queued (FE audit pass 20, LOW).
  if (way?.resumeAdmittedAt) return 'admitted';
  if (way?.releaseQueuedAt) return 'queued';
  const phase = resumePhase(iso, now, way?.resumeWindowEnd);
  if (phase !== 'ahead' && phase !== null && way?.waitingForSlot === true) return 'waiting';
  // Past the reset with no resume of the mine queued: nothing will bring it back — `stuck`, inside
  // its wake window (FE audit pass 18, LOW) AND past its end, where "has not resumed yet" softened
  // it (pass 19, LOW). Before the reset the job may simply not be written yet. A single `false`
  // can be a resumed mine between its job's end and its run record (BE B1); the summary hook only
  // passes on a `false` it has seen persist (confirmResumeQueued).
  return (phase === 'resuming' || phase === 'late') && way?.resumeQueued === false
    ? 'stuck'
    : phase;
};

/**
 * BE R17 spreads the wake after a reset over 30 min (KB_RESUME_SPREAD_MS /
 * TOKEN_LIMIT_PARK_SPREAD_MS): `resumeWindowEnd` is the reset + this.
 */
export const RESUME_SPREAD_MS = 30 * 60_000;

/**
 * The way back for ONE pause whose resume time is `iso`. The summary's `resumeWindowEnd` is the
 * LATEST over every pause of the mailbox, so applied to an older record it would keep a stale
 * pause "resuming" (FE audit pass 18, LOW): the record's own window is `iso` + the spread. No way
 * at all (no summary entry for the mailbox): the FE grace stands in for the window.
 */
export const ownWay = (
  way: ResumeWay | null | undefined,
  iso: string | null | undefined
): ResumeWay | null | undefined => {
  if (!way) return way;
  const at = iso ? Date.parse(iso) : Number.NaN;
  return {
    ...way,
    resumeWindowEnd: Number.isNaN(at) ? null : new Date(at + RESUME_SPREAD_MS).toISOString(),
  };
};
