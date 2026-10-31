/**
 * KB engine Stage 1: the contract of the backend endpoints behind the KB page (BE PR #1248).
 * Source of truth: the route OpenAPI blocks in knowledgeBaseRoutes.ts and the handlers'
 * response types. The envelope `{ success, data }` is stripped by the service.
 */

// ── Questions ───────────────────────────────────────────────────────────────────────────────

export type KbQuestionKind = 'merge' | 'attach' | 'capture_review' | 'entry_review';

export type KbQuestionEvidence = {
  threads: number;
  customers: number;
  firstAt: string | null;
  lastAt: string | null;
  /** Stage 3: always [] in Stage 1. */
  countries: string[];
};

export type KbQuestionAnswer = {
  entryId: number | null;
  label: 'A' | 'B';
  question: string;
  answer: string;
  evidence: KbQuestionEvidence;
};

/**
 * Choices per kind: merge accept / keep_separate / both_wrong; attach accept / keep_separate;
 * capture_review keep / remove / both_wrong; entry_review keep / remove / both_wrong.
 * (`pick_a` / `pick_b` are accepted by the schema; the server lists what a card offers.)
 */
export type KbQuestionChoiceKey =
  | 'pick_a'
  | 'pick_b'
  | 'accept'
  | 'keep_separate'
  | 'keep'
  | 'remove'
  | 'both_wrong';

export type KbQuestionChoice = { key: KbQuestionChoiceKey; label: string; needsText: boolean };

export type KbQuestion = {
  suggestionId: number;
  kind: KbQuestionKind;
  departmentId: number | null;
  prompt: string;
  answers: KbQuestionAnswer[];
  ruledOut: string[];
  guess: string | null;
  /** null: usage is not tracked yet. Never show 0 for it. */
  usedInDraftsLast7d: number | null;
  choices: KbQuestionChoice[];
  openedAt: string;
  /**
   * capture_review only: its review lapsed (14 days) or an automatic approval was sent back, and
   * the entries still wait. Answered keep/remove on those entries.
   */
  expired?: true;
};

export type KbQuestionsParams = {
  departmentId?: number;
  search?: string;
  cursor?: string;
  limit?: number;
};
export type KbQuestionsPage = {
  items: KbQuestion[];
  total: number;
  nextCursor: string | null;
  olderThan7d: number;
};

export type KbQuestionAnswerResult = {
  suggestionId: number;
  kind: KbQuestionKind;
  choice: KbQuestionChoiceKey;
  /** The result of the decision of that kind (shape depends on the kind). */
  result: unknown;
  /** The entries THIS answer changed, with the versions Undo restores to (absent on an older server). */
  changed?: KbAnswerChange[];
};

/** `versionBefore` null: the answer created the entry (a merge's case), so its undo is Unmerge. */
export type KbAnswerChange = {
  entryId: number;
  versionBefore: number | null;
  versionAfter: number | null;
};

// ── Case search ("Move into a case") ────────────────────────────────────────────────────────

export type KbCaseCandidate = {
  caseId: number;
  publicId: string | null;
  title: string;
  departmentId: number | null;
  /** `s:<mailbox id>` / `d:<team id>`; an entry joins only a case of its own scope. */
  scopeKey: string;
  members: number;
};

export type KbCaseSearchParams = {
  search?: string;
  departmentId?: number;
  scopeKey?: string;
  limit?: number;
};

// ── Engine summary ──────────────────────────────────────────────────────────────────────────

export const KB_ENGINE_FINDING_REASONS = [
  'raw_email',
  'awaiting_review',
  'customer_specific',
  'unclassified',
  'no_clear_language',
  'detached',
] as const;
export type KbEngineFindingReason = (typeof KB_ENGINE_FINDING_REASONS)[number];

/** The engine's actions, `releaseHold` (the engine ending a hold it made) included. */
export const KB_ENGINE_WEEK_ACTIONS = [
  'remove',
  'hold',
  'cleanPersonalData',
  'approveMined',
  'approveCaptures',
  'releaseHold',
] as const;
export type KbEngineWeekAction = (typeof KB_ENGINE_WEEK_ACTIONS)[number];

export type KbEngineSummary = {
  /** Stored nightly snapshot; null when never computed. */
  findings: Record<KbEngineFindingReason, number> | null;
  /** When `findings` were computed; null together with them. */
  findingsComputedAt: string | null;
  questions: { open: number; olderThan7d: number };
  week: {
    actions: number;
    undone: number;
    byAction: Record<KbEngineWeekAction, { applied: number; undone: number }>;
  };
  /** A kill switch that cannot be read counts as killed. */
  killed: { all: boolean; actions: string[] };
};

// ── Versions ────────────────────────────────────────────────────────────────────────────────

export type KbVersionActorKind = 'person' | 'engine' | 'system';

export type KbEntryText = {
  title: string;
  content: string;
  category: string | null;
  topics: string[] | null;
  question: string | null;
  answer: string | null;
  documentContent: string | null;
};

export type KbEntryLiveState = {
  approved: boolean;
  approvedBy: number | null;
  approvedAt: string | null;
  hidden: boolean;
  rejectedAt: string | null;
  rejectedBy: number | null;
  consolidatedInto: number | null;
  sourceDeleted: boolean;
  departmentId: number | null;
};

export type KbEntrySnapshot = KbEntryLiveState & {
  /** Present when that change changed the text. */
  text?: KbEntryText;
  /** The first text change of an entry carries the text it replaced. */
  textBefore?: KbEntryText;
  textUnchanged?: true;
  /** The text was removed (it held personal data the entry no longer holds): cannot be restored. */
  textRedacted?: true;
};

export type KbEntryVersion = {
  version: number;
  actorKind: KbVersionActorKind;
  actorUserId: number | null;
  engineActionId: number | null;
  reason: string;
  createdAt: string;
  snapshot: KbEntrySnapshot;
};

export type KbRestoreDone = {
  refused?: undefined;
  restoredTo: number;
  newVersion: number;
  unchanged?: true;
  via?: string;
};

/** A 409 from the restore, as a value (never thrown). */
export type KbRestoreRefusal =
  | { refused: 'later_changes'; later: KbEntryVersion[]; message: string }
  | { refused: 'text_redacted'; message: string }
  | { refused: 'merged_into_case'; caseId: number; message: string }
  | { refused: 'use_action_undo'; action: string; message: string }
  /** The entry changed while restoring (try again). */
  | { refused: 'changed_meanwhile'; message: string };

export type KbRestoreResult = KbRestoreDone | KbRestoreRefusal;

// ── Rollback ────────────────────────────────────────────────────────────────────────────────

export type KbRollbackSkipReason =
  | 'changed_after'
  | 'already_undone'
  | 'gone'
  | 'merged_into_case'
  | 'needs_own_undo'
  | 'no_version'
  | 'failed';

export type KbRollbackSkip = {
  entryId: number;
  /** The entry's public number (#KB-n) from the rollback's own window read; null: gone or none. */
  publicId?: string | null;
  reason: KbRollbackSkipReason;
  /** needs_own_undo: the action with its own undo (`auto:<action>`). */
  action?: string;
  /** needs_own_undo: the window's not-undone engine action ids on the entry. */
  actionIds?: number[];
};

export type KbRollbackRequest = {
  from: string;
  to: string;
  actions?: KbEngineWeekAction[];
  departmentId?: number;
  /** Default true on the server: a dry run writes nothing. */
  dryRun?: boolean;
  afterEntryId?: number;
};

export type KbRollbackResult = {
  dryRun: boolean;
  /** Entries with an engine action in the window (all pages). */
  matched: number;
  /** Entries handled by this call. */
  processed: number;
  /** Entries put back (0 on a dry run). */
  restored: number;
  /** Entries put back, or that a real run would put back. */
  entryIds: number[];
  /** Of entryIds: already as before; actions only marked undone. */
  alreadyAtTarget: number[];
  skipped: KbRollbackSkip[];
  /** Every entry handled by this call -> its public number (null: gone or none). */
  publicIds?: Record<number, string | null>;
  /** More entries than this call handled: call again with afterEntryId = nextAfterEntryId. */
  truncated: boolean;
  nextAfterEntryId: number | null;
};

// ── Undo an answer (POST /questions/:suggestionId/undo) ─────────────────────────────────────

export type KbUndoBlockReason = 'changed_after' | 'gone' | 'text_redacted' | 'not_in_case';
export type KbUndoBlock = { entryId: number; publicId: string | null; reason: KbUndoBlockReason };

/** All or nothing: either the question is open again, or a 409 says why, as a value. */
export type KbUndoResult =
  | { reopened: true; restored: Array<{ entryId: number; publicId: string | null }> }
  | { refused: 'blocked'; blocked: KbUndoBlock[]; message: string }
  | {
      refused: 'not_answered' | 'already_undone' | 'other';
      message: string;
    };
