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

/**
 * A KB mine as the backend sends it (runsView `kbRunViews`): the mail stages are zeros, `stages.kb`
 * is the mine's own conversations (queued = kbThreads, done = kbThreadsDone) and `kbEntries` its
 * saved pairs/documents; `saved` is 0 (kbRunLedger writes it so). `makeRun`'s mail stages on a
 * KB record drew a screen the BE never sends (pass 17 follow-up, LOW).
 */
export const makeKbRun = (over: Partial<RunView> = {}): RunView => {
  const run = makeRun({ channel: 'kb', duplicates: null, saved: 0, ...over });
  // Always derived, also when `over` spreads another record's stages: the BE never sends else.
  return {
    ...run,
    stages: {
      decided: { queued: 0, done: 0 },
      analysis: { queued: 0, done: 0 },
      embedding: { queued: 0, done: 0 },
      kb: { queued: run.kbThreads ?? 0, done: run.kbThreadsDone ?? 0 },
      awaitingRouting: 0,
    },
    kbEntries: { qaPairs: run.kbPairsSaved ?? 0, documents: run.kbDocumentsSaved ?? 0 },
  };
};

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
