import { isAxiosError } from 'axios';
import { apiClient } from '@/lib/api-client';

/**
 * Import progress of a Gmail source — counted by the backend in the database over a FIXED set of
 * message ids listed once, so it survives restarts and only ever moves forward. See
 * support-service `modules/inbox/ingestion/progress/`.
 */
export type ImportStage = 'imported' | 'decided' | 'analysis' | 'embedding' | 'kb';

export type StageEta =
  | { state: 'done' }
  | { state: 'estimating' }
  /** Neither the 5- nor the 15-minute window finished anything; overall, it names the stage. */
  | { state: 'stalled'; stage?: ImportStage }
  /** How much is left is not known (a capped listing counted past its floor). */
  | { state: 'unknown' }
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
  kbThreadsDone?: number;
  kbPairsSaved?: number;
  /** Documents (from attachments) the mine saved; absent from a backend before it counted them. */
  kbDocumentsSaved?: number;
};

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
  countCapped: boolean;
};

const numberOr = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/**
 * A backend without the runs view (or a partial answer) must not white-screen the panel: every
 * field the panel reads gets a value that says "nothing known", never an invented number.
 */
export const normaliseImportProgress = (raw: unknown): ImportProgress => {
  const data = (raw ?? {}) as Record<string, unknown>;
  const runs: RunsFields = {
    runs: Array.isArray(data.runs) ? (data.runs as RunView[]) : [],
    kbMiningFailures: Array.isArray(data.kbMiningFailures)
      ? (data.kbMiningFailures as KBMiningFailure[])
      : [],
    kbMiningFailuresTruncated: data.kbMiningFailuresTruncated === true,
    countCapped: data.countCapped === true,
    runsUnavailable: data.runsUnavailable === true,
  };
  return data.tracked === true
    ? ({ ...data, ...runs, tracked: true } as ImportProgress)
    : { ...runs, tracked: false };
};

const normaliseSummary = (raw: unknown): ProcessingSummaryEntry[] =>
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
      countCapped: entry.countCapped === true,
    }));

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

  recount: async (sourceId: number): Promise<void> => {
    await apiClient.post(`/api/integrations/${sourceId}/import-progress/recount`);
  },
};
