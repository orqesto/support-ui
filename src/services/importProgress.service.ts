import { isAxiosError } from 'axios';
import { apiClient } from '@/lib/api-client';

/**
 * Import progress of a Gmail source — counted by the backend in the database over a FIXED set of
 * message ids listed once, so it survives restarts and only ever moves forward. See
 * support-service `modules/inbox/ingestion/progress/`.
 */
export type ImportStage = 'imported' | 'decided' | 'analysis' | 'embedding' | 'kb';

export type UnknownEtaReason = 'listing_capped' | 'limit_unreadable' | 'pause_unknown';

export type StageEta =
  | { state: 'done' }
  | { state: 'estimating' }
  /** Neither the 5- nor the 15-minute window finished anything; overall, it names the stage. */
  | { state: 'stalled'; stage?: ImportStage }
  /**
   * The finish is not known. `reason` (BE round 20): `listing_capped` — how much is left is not
   * known (a capped listing counted past its floor); `limit_unreadable` — whether the daily AI
   * (KB) limit holds the stage's work could not be read (`stage` names it, `kb`); `pause_unknown`
   * (BE round 21) — the KB stage's own work is not moving, the KB limit is not over now, and the
   * queue's KB jobs parked by the limit could not be read in full, so whether the limit holds that
   * work is not known (`stage` `kb`; never finished, stalled or paused). Absent from an
   * older backend, whose only unknown was a capped listing; a reason this build does not know is
   * dropped by `normaliseImportProgress`, never guessed.
   */
  | { state: 'unknown'; reason?: UnknownEtaReason; stage?: ImportStage }
  /**
   * Work a daily AI token limit PARKED until `until` (ISO, the 00:00 UTC reset): it runs after the
   * reset, so it is neither finished nor stalled. Per stage (`kb`) and overall. BE R16; an older
   * backend never sends it.
   */
  | { state: 'paused'; stage?: ImportStage; until: string; resumeWindowEnd?: string }
  | {
      state: 'running';
      perMinute?: { short: number; long: number };
      minMinutes: number;
      /** Null when the pessimistic end is unknown (one window finished nothing). */
      maxMinutes: number | null;
    };

export type StageProgress = {
  stage: ImportStage;
  done: number;
  total: number;
  /** The total is estimated from the share imported so far; exact once everything is in. */
  projected: boolean;
  /**
   * Finished with this much NOT done: nothing is left in the queue to do it. Absent from a
   * backend older than this field.
   */
  leftover?: number;
  eta: StageEta;
};

export type ImportRun = {
  state: 'counting' | 'ready' | 'failed';
  startedAt: string;
  countedAt: string | null;
  total: number | null;
  /** The listing stopped at a cap: `total` is a floor. */
  capped: boolean;
  cappedBy: 'size' | 'time' | 'quota' | 'error' | null;
  /**
   * The capped listing is still being continued in the background. Optional: a backend from
   * before it sends nothing, which reads as "counting stopped" — what that backend did.
   */
  countingOn?: boolean;
  query: string | null;
  error: string | null;
};

/** How a recorded mail run ended (support-service runLedger). */
export type RunOutcome = 'running' | 'done' | 'failed' | 'paused' | 'error';

/** What the backend says wants attention on a run (support-service runsView `problemsOf`). */
export type RunProblem = 'failed' | 'paused' | 'interrupted' | 'stalled';

export type RunStageCount = { queued: number; done: number };

/**
 * One mail check that found new mail (Gmail or IMAP), with its later stages counted in the
 * database over exactly the messages it saved. Runs that found nothing are not recorded.
 */
export type RunView = {
  id: string;
  /** `kb`: a knowledge-base mine (KB switched on, the history sweep, a re-mine). */
  channel: 'gmail' | 'imap' | 'kb';
  startedAt: string;
  finishedAt: string | null;
  found: number;
  saved: number;
  /** Null when the channel cannot know it (IMAP): never shown as 0. */
  duplicates: number | null;
  failed: number;
  deferred: boolean;
  /** Why it stopped short (quota, rate limit, lost lock…); absent from older records. */
  stoppedBy?: string | null;
  linked: number;
  fetchMs: number | null;
  processMs: number | null;
  outcome: RunOutcome;
  /** Null when the run is no longer counted (settled, or past the backend's cap). */
  stages: {
    decided: RunStageCount;
    analysis: RunStageCount;
    embedding: RunStageCount;
    kb: RunStageCount;
    awaitingRouting: number;
  } | null;
  workRemaining: boolean;
  /** Recorded as running AND really running. */
  active: boolean;
  problems: RunProblem[];
  kbEntries: { qaPairs: number; documents: number } | null;
  /** A KB mine's own progress: conversations to read, read so far, new Q&A pairs saved. */
  kbThreads?: number;
  /** A mine the daily KB token limit paused: when it resumes (ISO). Absent otherwise. */
  resumesAt?: string | null;
  /**
   * A KB-limit pause a later KB mine is carrying on NOW (support-service runsView, BE round 9): its
   * `paused` problem is dropped (`failed` stays). Absent otherwise and from an older backend.
   */
  resumed?: true;
  /**
   * BE R17: a MAIL run whose only owed work is KB work the daily KB limit holds — held `until` the
   * reset, due to wake by `resumeWindowEnd`. Such a run is not `stalled`. Absent otherwise.
   */
  kbLimitPause?: { until: string; resumeWindowEnd: string };
  /**
   * BE round 21: a MAIL run whose only owed work is KB work, ended over 30 min ago, where whether
   * the daily KB limit holds that work is NOT KNOWN — `pause_unknown` (the queue's parked KB jobs
   * could not be read in full) or `limit_unreadable` (the limit could not be read and none was
   * found parked). Such a run is neither `stalled` nor paused and not a problem; the summary counts
   * it in `kbStateUnknown`. Absent otherwise and from an older backend; an unknown reason is
   * dropped by `normaliseImportProgress` (the field with it).
   */
  kbStateUnknown?: { reason: KbStateUnknownReason };
  kbThreadsDone?: number;
  kbPairsSaved?: number;
  /** Documents (from attachments) the mine saved; absent from a backend before it counted them. */
  kbDocumentsSaved?: number;
};

export type KbStateUnknownReason = 'pause_unknown' | 'limit_unreadable';

export type KBMiningFailure = { conversationId: number; at: string; error: string };

/** Every mail source's runs, on both a tracked and an untracked answer. */
export type RunsFields = {
  /** Newest first. */
  runs: RunView[];
  kbMiningFailures: KBMiningFailure[];
  /** Older failures were dropped: the list is a floor. */
  kbMiningFailuresTruncated: boolean;
  /** Older runs still owing work were left uncounted. */
  countCapped: boolean;
  /** The runs could not be read this time (the import progress still could). */
  runsUnavailable: boolean;
};

/** A Gmail import's listing and stage progress (what ImportProgressPanel draws). */
export type TrackedImport = {
  tracked: true;
  run: ImportRun;
  progress?: {
    total: number;
    capped: boolean;
    imported: number;
    drained: boolean;
    notStored: number;
    awaitingRouting: number;
    unrecorded: number;
    stages: StageProgress[];
    eta: StageEta;
    sampledAt: string;
  };
};

export type ImportProgress = ({ tracked: false } & RunsFields) | (TrackedImport & RunsFields);

/** Per mail source, for the header indicator (GET /api/integrations/processing-summary). */
export type ProcessingSummaryEntry = {
  sourceId: number;
  name: string;
  type: string;
  unavailable: boolean;
  inProgress: number;
  problems: number;
  /**
   * The KB-limit pauses, counted apart from `problems` (which does not include them): the paused KB
   * mine and the mail runs whose only owed work the KB limit holds (in neither `problems` nor
   * `inProgress`). `pausedUntil`: the latest of their resume times (may be PAST for a stale
   * record, and inside the wake window); `resumeWindowEnd`: the latest end of their wake window —
   * the reset + 30 min, or for KB jobs found parked in the queue the latest one's due time —
   * before it a pause is on schedule. Null: none recorded.
   *
   * Optional in the type, but `normaliseSummary` always sets every field below (0 / null from a
   * backend from before the token limits, which never pauses anything).
   */
  pausedByLimit?: number;
  pausedUntil?: string | null;
  resumeWindowEnd?: string | null;
  /** The paused mine's way back (null = no paused mine, or not known). */
  resumeQueued?: boolean | null;
  waitingForSlot?: boolean | null;
  releaseQueuedAt?: string | null;
  /**
   * The paused KB MINE's own reset and wake-window end (null: no paused mine, or the source could
   * not be read). `pausedUntil`/`resumeWindowEnd` are the latest over EVERY pause, so a stuck mine
   * hid behind a held mail run whose pause is still ahead.
   */
  minePausedUntil?: string | null;
  mineResumeWindowEnd?: string | null;
  /**
   * When a resume admitted the paused mine (non-null only while that admission is newer than the
   * pause and the mine's running record has not replaced it) — the mine is starting.
   */
  resumeAdmittedAt?: string | null;
  /**
   * BE round 21: mail runs whose only owed KB work may be held by the daily KB limit and that
   * cannot be told (`RunView.kbStateUnknown`) — in none of `inProgress`, `pausedByLimit` or
   * `problems`. Always set by `normaliseSummary` (0 from a backend without it).
   */
  kbStateUnknown?: number;
  countCapped: boolean;
};

const UNKNOWN_REASONS: readonly string[] = ['listing_capped', 'limit_unreadable', 'pause_unknown'];
const KB_STATE_UNKNOWN_REASONS: readonly string[] = ['pause_unknown', 'limit_unreadable'];
const STAGES: readonly string[] = ['imported', 'decided', 'analysis', 'embedding', 'kb'];

/**
 * An `unknown` eta keeps only a reason (and stage) this build knows: absent stays absent, an
 * unknown string is dropped (it then reads as an older backend's — a capped listing). Every other
 * eta passes through unchanged.
 */
export const normaliseEta = (eta: StageEta): StageEta => {
  if (!eta || typeof eta !== 'object' || eta.state !== 'unknown') return eta;
  const raw = eta as Record<string, unknown>;
  return {
    state: 'unknown',
    ...(typeof raw.reason === 'string' && UNKNOWN_REASONS.includes(raw.reason)
      ? { reason: raw.reason as UnknownEtaReason }
      : {}),
    ...(typeof raw.stage === 'string' && STAGES.includes(raw.stage)
      ? { stage: raw.stage as ImportStage }
      : {}),
  };
};

const normaliseProgress = (progress: unknown): unknown => {
  if (!progress || typeof progress !== 'object') return progress;
  const data = progress as Record<string, unknown>;
  return {
    ...data,
    ...(data.eta ? { eta: normaliseEta(data.eta as StageEta) } : {}),
    ...(Array.isArray(data.stages)
      ? {
          stages: (data.stages as unknown[]).map((stage) =>
            stage && typeof stage === 'object' && (stage as StageProgress).eta
              ? { ...stage, eta: normaliseEta((stage as StageProgress).eta) }
              : stage
          ),
        }
      : {}),
  };
};

const numberOr = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const stringOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/**
 * A mail run's `kbStateUnknown` is kept only with a reason this build knows: an unknown reason drops
 * the field (never guessed into one of ours). Every other field passes through unchanged.
 */
const normaliseRun = (run: unknown): RunView => {
  if (!run || typeof run !== 'object' || !('kbStateUnknown' in run)) return run as RunView;
  const { kbStateUnknown, ...rest } = run as Record<string, unknown>;
  const reason =
    kbStateUnknown && typeof kbStateUnknown === 'object'
      ? (kbStateUnknown as Record<string, unknown>).reason
      : undefined;
  return typeof reason === 'string' && KB_STATE_UNKNOWN_REASONS.includes(reason)
    ? ({ ...rest, kbStateUnknown: { reason: reason as KbStateUnknownReason } } as RunView)
    : (rest as RunView);
};

/**
 * A backend without the runs view (or a partial answer) must not white-screen the panel: every
 * field the panel reads gets a value that says "nothing known", never an invented number.
 */
export const normaliseImportProgress = (raw: unknown): ImportProgress => {
  const data = (raw ?? {}) as Record<string, unknown>;
  const runs: RunsFields = {
    runs: Array.isArray(data.runs) ? (data.runs as unknown[]).map(normaliseRun) : [],
    kbMiningFailures: Array.isArray(data.kbMiningFailures)
      ? (data.kbMiningFailures as KBMiningFailure[])
      : [],
    kbMiningFailuresTruncated: data.kbMiningFailuresTruncated === true,
    countCapped: data.countCapped === true,
    runsUnavailable: data.runsUnavailable === true,
  };
  return data.tracked === true
    ? ({
        ...data,
        ...('progress' in data ? { progress: normaliseProgress(data.progress) } : {}),
        ...runs,
        tracked: true,
      } as ImportProgress)
    : { ...runs, tracked: false };
};

export const normaliseSummary = (raw: unknown): ProcessingSummaryEntry[] =>
  (Array.isArray(raw) ? raw : [])
    .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && !!entry)
    .filter((entry) => typeof entry.sourceId === 'number')
    .map((entry) => ({
      sourceId: entry.sourceId as number,
      name: typeof entry.name === 'string' ? entry.name : `Mailbox ${String(entry.sourceId)}`,
      type: typeof entry.type === 'string' ? entry.type : 'email',
      unavailable: entry.unavailable === true,
      inProgress: numberOr(entry.inProgress, 0),
      problems: numberOr(entry.problems, 0),
      // The KB-limit pause fields: the current backend sends every one on every entry; a backend
      // from before the token limits sends none (nothing is ever paused there) — read as nothing
      // paused and nothing known, never guessed. A non-answer is null (not known).
      pausedByLimit: numberOr(entry.pausedByLimit, 0),
      pausedUntil: stringOrNull(entry.pausedUntil),
      resumeWindowEnd: stringOrNull(entry.resumeWindowEnd),
      resumeQueued: typeof entry.resumeQueued === 'boolean' ? entry.resumeQueued : null,
      waitingForSlot: typeof entry.waitingForSlot === 'boolean' ? entry.waitingForSlot : null,
      releaseQueuedAt: stringOrNull(entry.releaseQueuedAt),
      minePausedUntil: stringOrNull(entry.minePausedUntil),
      mineResumeWindowEnd: stringOrNull(entry.mineResumeWindowEnd),
      resumeAdmittedAt: stringOrNull(entry.resumeAdmittedAt),
      // BE round 21; absent from an older backend (which never says "not known") ⇒ 0.
      kbStateUnknown: numberOr(entry.kbStateUnknown, 0),
      countCapped: entry.countCapped === true,
    }));

/** One conversation a run still owes work on (support-service importProgressCounts). */
export type OwedConversation = {
  conversationId: number;
  publicId: string | null;
  deleted: boolean;
  /** Set on a merge tombstone: the conversation it was merged into. */
  mergedIntoConversationId: number | null;
  /** Whether the ticket the merge chain ends on is live; absent from the #924 backend. */
  mergedIntoLive?: boolean;
  /** What a retry does with a tombstone's mail; only `move` is linked (to its live target). */
  mergeOutcome?: 'move' | 'revive' | 'restore';
  mergeTargetId?: number;
  mergeTargetPublicId?: string;
};

/**
 * `count`: messages for `decided`/`analysis`, conversations for `embedding`/`kb`.
 * `conversations` is capped (20). `hiddenCount`: conversations outside the caller's departments;
 * absent from the #924 backend.
 */
export type OwedList = {
  count: number;
  hiddenCount?: number;
  /** Conversations (tickets) owing the stage, all departments; absent from the #924 backend. */
  conversationCount?: number;
  conversations: OwedConversation[];
};

export type OwedStageKey = 'decided' | 'analysis' | 'embedding' | 'kb';

/** GET /api/integrations/:id/import-progress/runs/:runId/owed — what one run still owes. */
export type RunOwed = {
  /** Absent from the #924 backend: read as false (the retry is not offered). */
  canRetry: boolean;
  owed: Record<OwedStageKey, OwedList>;
};

/**
 * POST …/runs/:runId/retry-owed — the same shape for a dry run and the real one, read down to what
 * the panel says: per stage how many are (or will be) retried, and whether anything was held back.
 */
export type RetryOwedResult = {
  dryRun: boolean;
  /** Messages: `found` owed and reachable (of which `handled` are only marked), `queued` re-run. */
  decided: { found: number; handled: number; queued: number };
  /** Conversations queued (or, in a dry run, to queue) again. */
  embedding: { queued: number };
  kb: { queued: number };
  /** Held back for now: already queued, retried recently, a busy or full queue, too new. */
  heldBackForNow: boolean;
  /** Knowledge-base items held while the workspace is paused (`kb.blocked`). */
  heldBackPaused: boolean;
  /** Held back for good by this button: retried the most times, too old, not repairable here. */
  heldBackForGood: boolean;
  /** This retry did not cover everything it could reach. */
  truncated: boolean;
  /** It stopped part-way: the counts are what it did before. */
  failed: { error: string } | null;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const normaliseOwedList = (raw: unknown): OwedList => {
  const data = asRecord(raw);
  const hidden = data.hiddenCount;
  return {
    count: numberOr(data.count, 0),
    ...(typeof hidden === 'number' && Number.isFinite(hidden) ? { hiddenCount: hidden } : {}),
    ...(typeof data.conversationCount === 'number' && Number.isFinite(data.conversationCount)
      ? { conversationCount: data.conversationCount }
      : {}),
    conversations: (Array.isArray(data.conversations) ? data.conversations : [])
      .map(asRecord)
      .filter((row) => typeof row.conversationId === 'number')
      .map((row) => ({
        conversationId: row.conversationId as number,
        publicId: stringOrNull(row.publicId),
        deleted: row.deleted === true,
        mergedIntoConversationId:
          typeof row.mergedIntoConversationId === 'number' ? row.mergedIntoConversationId : null,
        ...(typeof row.mergedIntoLive === 'boolean' ? { mergedIntoLive: row.mergedIntoLive } : {}),
        ...(row.mergeOutcome === 'move' ||
        row.mergeOutcome === 'revive' ||
        row.mergeOutcome === 'restore'
          ? { mergeOutcome: row.mergeOutcome }
          : {}),
        ...(typeof row.mergeTargetId === 'number' ? { mergeTargetId: row.mergeTargetId } : {}),
        ...(typeof row.mergeTargetPublicId === 'string'
          ? { mergeTargetPublicId: row.mergeTargetPublicId }
          : {}),
      })),
  };
};

/** Every field the section reads gets a value; `canRetry` absent ⇒ false (never offered blind). */
export const normaliseRunOwed = (raw: unknown): RunOwed => {
  const data = asRecord(raw);
  const owed = asRecord(data.owed);
  return {
    canRetry: data.canRetry === true,
    owed: {
      decided: normaliseOwedList(owed.decided),
      analysis: normaliseOwedList(owed.analysis),
      embedding: normaliseOwedList(owed.embedding),
      kb: normaliseOwedList(owed.kb),
    },
  };
};

/**
 * Each held-back count the backend sends, classified ONCE: for now (a later retry may act on it) or
 * for good (this button will not). `dropped` is the search-index queue past its ceiling — for now.
 */
const FOR_NOW_DECIDED = ['pending'];
const FOR_GOOD_DECIDED = ['exhausted', 'notRepairable'];
const FOR_NOW_STAGE = ['pending', 'recentlyRetried', 'dropped', 'busy'];
const FOR_GOOD_STAGE = ['exhausted'];

const anyPositive = (data: Record<string, unknown>, keys: string[]): boolean =>
  keys.some((key) => numberOr(data[key], 0) > 0);

/**
 * `unreachable` by its parts: too old is for good; too new / just retried for now. Without a
 * breakdown, a single reason says which; `mixed` or none means both may apply.
 */
const unreachableKinds = (decided: Record<string, unknown>): { now: boolean; good: boolean } => {
  if (numberOr(decided.unreachable, 0) <= 0) return { now: false, good: false };
  const by = asRecord(decided.unreachableBy);
  if ('unreachableBy' in decided && decided.unreachableBy)
    return {
      now: numberOr(by.tooNew, 0) + numberOr(by.justRetried, 0) > 0,
      good: numberOr(by.tooOld, 0) > 0,
    };
  const reason = decided.unreachableReason;
  if (reason === 'too_old') return { now: false, good: true };
  if (reason === 'too_new' || reason === 'just_retried') return { now: true, good: false };
  return { now: true, good: true };
};

export const normaliseRetryOwed = (raw: unknown): RetryOwedResult => {
  const data = asRecord(raw);
  const decided = asRecord(data.decided);
  const embedding = asRecord(data.embedding);
  const kb = asRecord(data.kb);
  const failed = asRecord(data.failed);
  const unreachable = unreachableKinds(decided);
  return {
    dryRun: data.dryRun !== false,
    decided: {
      found: numberOr(decided.found, 0),
      handled: numberOr(decided.handled, 0),
      queued: numberOr(decided.queued, 0),
    },
    embedding: { queued: numberOr(embedding.queued, 0) },
    kb: { queued: numberOr(kb.queued, 0) },
    heldBackForNow:
      anyPositive(decided, FOR_NOW_DECIDED) ||
      anyPositive(embedding, FOR_NOW_STAGE) ||
      anyPositive(kb, FOR_NOW_STAGE) ||
      unreachable.now ||
      data.kbPendingUnknown === true,
    // `workspaceBlocked` is set whatever is owed: only the KB items it held (`kb.blocked`) count.
    heldBackPaused: numberOr(kb.blocked, 0) > 0,
    heldBackForGood:
      anyPositive(decided, FOR_GOOD_DECIDED) ||
      anyPositive(embedding, FOR_GOOD_STAGE) ||
      anyPositive(kb, FOR_GOOD_STAGE) ||
      unreachable.good,
    truncated: data.truncated === true,
    failed:
      typeof failed.stage === 'string' || typeof failed.error === 'string'
        ? { error: typeof failed.error === 'string' ? failed.error : '' }
        : null,
  };
};

export const importProgressService = {
  /** `start`: list the mailbox if the source has no run yet (only when this looks like an import). */
  get: async (sourceId: number, start = false): Promise<ImportProgress> => {
    const response = await apiClient.get<{ success: boolean; data: unknown }>(
      `/api/integrations/${sourceId}/import-progress`,
      start ? { params: { start: '1' } } : undefined
    );
    return normaliseImportProgress(response.data.data);
  },

  /** Runs in progress and problems per mail source of the current workspace. */
  summary: async (): Promise<ProcessingSummaryEntry[]> => {
    const response = await apiClient.get<{ success: boolean; data: unknown }>(
      '/api/integrations/processing-summary'
    );
    return normaliseSummary(response.data.data);
  },

  /**
   * Stop showing a knowledge-base thread whose mining failed (until it fails again). A 404 means
   * it is already gone — dismissed elsewhere, or cleared by a later success — which is what the
   * person asked for.
   */
  dismissKbFailure: async (sourceId: number, conversationId: number): Promise<void> => {
    try {
      await apiClient.delete(`/api/integrations/${sourceId}/kb-mining-failures/${conversationId}`);
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 404) return;
      throw error;
    }
  },

  /** What one run still owes, per stage — read on demand, never on the panel's poll. */
  owed: async (sourceId: number, runId: string): Promise<RunOwed> => {
    const response = await apiClient.get<{ success: boolean; data: unknown }>(
      `/api/integrations/${sourceId}/import-progress/runs/${encodeURIComponent(runId)}/owed`
    );
    return normaliseRunOwed(response.data.data);
  },

  /**
   * Re-run what one run owes. ⛔ `dryRun` is always sent: the backend refuses a body without it,
   * and only the confirm sends `false`.
   */
  retryOwed: async (sourceId: number, runId: string, dryRun: boolean): Promise<RetryOwedResult> => {
    const response = await apiClient.post<{ success: boolean; data: unknown }>(
      `/api/integrations/${sourceId}/import-progress/runs/${encodeURIComponent(runId)}/retry-owed`,
      { dryRun }
    );
    // The words ("to queue" / "queued") follow what was ASKED, not a field the answer may lack.
    return { ...normaliseRetryOwed(response.data.data), dryRun };
  },

  recount: async (sourceId: number): Promise<void> => {
    await apiClient.post(`/api/integrations/${sourceId}/import-progress/recount`);
  },
};
