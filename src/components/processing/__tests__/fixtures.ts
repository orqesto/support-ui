import type { ImportProgress, RunView } from '@/services/importProgress.service';

export const makeRun = (over: Partial<RunView> = {}): RunView => ({
  id: 'run-1',
  channel: 'gmail',
  startedAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(),
  found: 3,
  saved: 3,
  duplicates: 0,
  failed: 0,
  deferred: false,
  stoppedBy: null,
  linked: 0,
  fetchMs: null,
  processMs: null,
  outcome: 'done',
  stages: {
    decided: { queued: 3, done: 3 },
    analysis: { queued: 3, done: 3 },
    embedding: { queued: 1, done: 1 },
    kb: { queued: 0, done: 0 },
    awaitingRouting: 0,
  },
  workRemaining: false,
  active: false,
  problems: [],
  kbEntries: { qaPairs: 0, documents: 0 },
  ...over,
});

export const untracked = (over: Partial<Extract<ImportProgress, { tracked: false }>> = {}) =>
  ({
    tracked: false,
    runs: [],
    kbMiningFailures: [],
    kbMiningFailuresTruncated: false,
    countCapped: false,
    runsUnavailable: false,
    ...over,
  }) as Extract<ImportProgress, { tracked: false }>;
