// ---- KB history range (mirrors the backend's range/kbHistoryRangeTypes.ts + kbMineTypes.ts) ----
export type KbAiUnavailableReason = 'provider_quota' | 'rate_limited' | 'settings_unreadable';
export type KbCapSkip = { storedMessages: number; historyWindow: number };

export type KbRangeErrorCode =
  | 'SOURCE_NOT_FOUND'
  | 'NOT_KB_SOURCE'
  | 'UNSUPPORTED_SOURCE_TYPE'
  | 'MINING_OFF'
  | 'SOURCE_DISABLED'
  | 'PLAN_INACTIVE'
  | 'LEGACY_GMAIL_CONFIG'
  | 'NO_SOURCE_CONFIG'
  | 'PLAN_HISTORY_LIMIT'
  | 'IMAP_RANGE_LIMIT'
  | 'AI_UNAVAILABLE'
  | 'APPLY_IN_PROGRESS'
  | 'COUNT_IN_PROGRESS'
  | 'INVALID_BODY'
  | 'COUNT_TIMED_OUT'
  | 'NOT_WORKSPACE_ADMIN'
  | 'MAILBOX_SIGN_IN'
  | 'MAILBOX_QUOTA'
  | 'MAILBOX_UNREADABLE'
  | 'MAILBOX_ERROR'
  | 'PLAN_UNREADABLE'
  | 'INVALID_ID';
export type KbRangeError = {
  success: false;
  code: KbRangeErrorCode;
  error: string;
  message?: string;
  data?: { maxHistoryDays?: number; aiReason?: KbAiUnavailableReason };
};
export type KbRangeRequest = {
  days?: number;
  apply?: boolean;
  estimate?: {
    historyToFetch?: number;
    recentToFetch?: number | null;
    estimatedTokens?: number | null;
  };
};
export type KbRangeOption = {
  days: number;
  label: string;
  isCurrent: boolean;
  selectable: boolean;
};
export type KbLastSweep = {
  state:
    | 'complete'
    | 'partial'
    | 'kb_full'
    | 'ai_incomplete'
    | 'paused'
    | 'failed'
    | 'running'
    | 'unknown';
  at: string | null;
  capSkipped: KbCapSkip | null;
  threadsWaiting: number | null;
  aiSkipped: number | null;
  aiReason: string | null;
  aiIncompleteSince: string | null;
  pausedUntil: string | null;
};
export type KbRangePolicy = {
  sourceId: number;
  type: 'gmail' | 'email' | 'other';
  name: string;
  enabled: boolean;
  kbCutoff: string | null;
  currentDays: number;
  options: KbRangeOption[];
  planMaxHistoryDays: number | null;
  sweepInProgress: boolean;
  lastSweep: KbLastSweep;
  blocked: { code: KbRangeErrorCode; message: string } | null;
  openWindowDays: number;
  kbLimitReachedToday: boolean;
  /** `unknown`: whether an AI provider is configured could not be read. */
  aiMode: 'none' | 'own_key' | 'managed' | 'unknown';
  aiUnavailable: { reason: KbAiUnavailableReason; message: string } | null;
};
export type KbRangeCount = {
  inRange: number;
  inOdly: number;
  toFetch: number;
  unverifiable: number;
  notCompared: number;
  capped: boolean;
  cappedBy: 'size' | 'time' | 'quota' | 'error' | 'failed' | null;
  timedOut: boolean;
  approximate: boolean;
  from: string | null;
  to: string | null;
};
export type KbRangeEstimate = {
  newThreads: number;
  backlogThreads: number;
  threadsToMine: number;
  threadsBasis: 'distinct_threads' | 'upper_bound_messages';
  tokensPerThread: number | null;
  estimatedTokens: number | null;
  daysAtLimit: number | null;
  limit: number;
  spentToday: number;
  enforced: boolean;
};
export type KbRangeRoom = {
  storedMessages: { limit: number; used: number; left: number } | null;
  kbItems: { limit: number; used: number; left: number } | null;
  projectedSkipped: number;
  kbFull: boolean;
};
export type KbRangeDryRun = KbRangePolicy & {
  days: number;
  direction: 'wider' | 'same' | 'narrower';
  history: KbRangeCount | null;
  recent: KbRangeCount | null;
  estimate: KbRangeEstimate | null;
  room: KbRangeRoom;
  aiAllowance: { callsLeftThisMonth: number | null; estimatedCalls: number | null; short: boolean };
};
export type KbRangeApplied = {
  applied: true;
  days: number;
  direction: 'wider' | 'same' | 'narrower';
  sweepRequested: boolean;
  restarted: boolean;
  importRunStarted: boolean;
};

/** What `POST /api/integrations/:id/kb-history-range` answers, by mode (policy / dry run / apply). */
export type KbRangeResult = KbRangePolicy | KbRangeDryRun | KbRangeApplied;
