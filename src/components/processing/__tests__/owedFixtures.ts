/** Backend answers for the owed list and its retry, as the OwedWork suites send them. */
import type * as ServiceModule from '@/services/importProgress.service';
import { makeRun } from './fixtures';

export const empty = () => ({ count: 0, hiddenCount: 0, conversations: [] });
export const conv = (
  conversationId: number,
  publicId: string | null = `SUP-${conversationId}`
) => ({
  conversationId,
  publicId,
  departmentId: 1,
  deleted: false,
  mergedIntoConversationId: null,
});

/** GET owed as the current backend answers it (hiddenCount always present, canRetry). */
export const owedOf = (
  over: Record<string, unknown> = {},
  extra: Record<string, unknown> = {}
) => ({
  run: { id: 'run-1', channel: 'gmail', startedAt: '2026-10-08T08:00:00Z', outcome: 'done' },
  scope: 'all',
  canRetry: true,
  owed: {
    decided: empty(),
    analysis: empty(),
    embedding: { count: 1, hiddenCount: 0, conversations: [conv(4401)] },
    kb: empty(),
    excludedDeleted: empty(),
    ...over,
  },
  ...extra,
});

/** GET owed as the #924 backend (on main) answers it: no canRetry, no hiddenCount. */
export const owedOfOld = (over: Record<string, unknown> = {}) => ({
  run: { id: 'run-1', channel: 'gmail', startedAt: '2026-10-08T08:00:00Z', outcome: 'done' },
  scope: 'all',
  owed: {
    decided: { count: 0, conversations: [] },
    analysis: { count: 0, conversations: [] },
    embedding: { count: 1, conversations: [conv(4401)] },
    kb: { count: 0, conversations: [] },
    excludedDeleted: { count: 0, conversations: [] },
    ...over,
  },
});

export const stageRetry = (over: Record<string, unknown> = {}) => ({
  owed: 0,
  queued: 0,
  pending: 0,
  recentlyRetried: 0,
  exhausted: 0,
  dropped: 0,
  busy: 0,
  blocked: 0,
  conversations: [],
  ...over,
});

/** POST retry-owed as the current backend answers it. */
export const retryOf = (dryRun: boolean, over: Record<string, unknown> = {}) => ({
  dryRun,
  decided: {
    owed: 0,
    found: 0,
    handled: 0,
    queued: 0,
    rehomed: 0,
    revived: 0,
    restored: 0,
    pending: 0,
    exhausted: 0,
    unreachable: 0,
    notRepairable: 0,
  },
  embedding: stageRetry({
    owed: 1,
    queued: 1,
    conversations: [{ conversationId: 4401, publicId: 'SUP-4401', action: 'queue' }],
  }),
  kb: stageRetry(),
  analysisOwed: 0,
  kbPendingUnknown: false,
  workspaceBlocked: false,
  truncated: false,
  failed: null,
  ...over,
});

export const decidedOf = (over: Record<string, unknown> = {}) => ({
  ...retryOf(true).decided,
  ...over,
});

export const failWith = (status: number, error?: string) => () =>
  Promise.reject(
    Object.assign(new Error(`HTTP ${status}`), {
      status,
      data: error ? { success: false, error } : undefined,
    })
  );

export const stalled = (over: Partial<ServiceModule.RunView> = {}) =>
  makeRun({
    workRemaining: true,
    problems: ['stalled'],
    stages: {
      decided: { queued: 3, done: 3 },
      analysis: { queued: 3, done: 3 },
      embedding: { queued: 2, done: 1 },
      kb: { queued: 0, done: 0 },
      awaitingRouting: 0,
    },
    ...over,
  });
