/**
 * KB engine Stage 1 (F5): the words of the Engine activity panel, the window rollback and the
 * entry's version history. Agent words (§8): the actor is always "Engine".
 */
import type {
  KbEngineFindingReason,
  KbEngineWeekAction,
  KbEntrySnapshot,
  KbEntryVersion,
  KbRestoreRefusal,
  KbRollbackSkip,
  KbRollbackSkipReason,
  KbVersionActorKind,
} from '@/services/kbEngine.types';

/** One finding count on the strip: "7 raw emails". */
export const FINDING_CHIP_LABEL: Record<KbEngineFindingReason, string> = {
  raw_email: 'raw emails',
  awaiting_review: 'awaiting review',
  customer_specific: 'customer-specific',
  unclassified: 'could not classify',
  no_clear_language: 'no clear language',
  detached: 'detached',
};

/** The engine's actions, in agent words (the rollback's action picker, the switched-off line). */
export const ENGINE_ACTION_LABEL: Record<KbEngineWeekAction, string> = {
  remove: 'Removing entries',
  hold: 'Setting answers aside',
  cleanPersonalData: 'Removing personal details',
  approveMined: 'Making learned answers live',
  approveCaptures: 'Making saved answers live',
  releaseHold: 'Using set-aside answers again',
};

/** The gate before an action may run alone (mirrors the server's MIN_RATED / MIN_AGREEMENT). */
export const GATE_RATED = 20;
export const GATE_PERCENT = 90;
export const GATE_TEXT =
  'After 20 ratings at 90 % or better, you can switch this action to Automatic.';

/** `auto:remove` → its action label; anything else as it came. */
const actionOfReason = (action: string | undefined): string => {
  const key = (action ?? '').replace(/^auto:/, '') as KbEngineWeekAction;
  return ENGINE_ACTION_LABEL[key] ?? 'another engine action';
};

/** Why the rollback leaves an entry as it is, in plain words. */
export const rollbackSkipText = (skip: Pick<KbRollbackSkip, 'reason' | 'action'>): string => {
  const words: Record<KbRollbackSkipReason, string> = {
    changed_after: 'A person changed it later',
    needs_own_undo: `Has an undo of its own (${actionOfReason(skip.action)}): undo it from Changed by the engine`,
    merged_into_case: 'It is merged into a case: undo the merge instead',
    no_version: 'No earlier version to go back to',
    already_undone: 'Already undone',
    gone: 'The entry no longer exists',
    failed: 'Could not be put back this time; run it again',
  };
  return words[skip.reason] ?? 'Left as it is';
};

export const ACTOR_LABEL: Record<KbVersionActorKind, string> = {
  person: 'A person',
  engine: 'Engine',
  system: 'System',
};

const EXACT_REASON: Record<string, string> = {
  original: 'As it was before its first recorded change',
  approve: 'Made live',
  hide: 'Hidden',
  unhide: 'Shown again',
  edit: 'Text edited',
  reject: 'Turned down',
  promote: 'Saved to the knowledge base',
  'question:both_wrong': 'Answer written in a question',
  restore_auto_removed: 'Put back after the engine removed it',
  return_to_review: 'Sent back for review',
  undo_clean: 'Clean-up undone: the original text is back',
  'auto:remove': 'Removed by the engine',
  'auto:hold': 'Set aside by the engine',
  'auto:cleanPersonalData': 'Personal details removed by the engine',
  'auto:approveMined': 'Made live by the engine (learned from mail)',
  'auto:approveCaptures': 'Made live by the engine (saved by a person)',
  'auto:release_hold': 'Used again by the engine',
  'auto:releaseHold': 'Used again by the engine',
  'case:attach': 'Moved into a case',
  'case:detach': 'Removed from a case',
  'quality:keep': 'Kept after a review',
  'quality:apply': 'Changed after a review',
  'quality:reject': 'Turned down after a review',
  'rollback:unapprove': 'Rolled back: not live yet',
};

const PREFIX_REASON: Array<[string, string]> = [
  ['restore:v', 'Restored to version '],
  ['question:', 'Decided in a question'],
  ['case:unmerge', 'Case split up'],
  ['case:', 'Case changed'],
  ['rollback:', 'Rolled back'],
  ['repair:', 'Repaired automatically'],
  ['source:retire', 'Its source was removed'],
  ['source:', 'Its source changed'],
  ['quality:', 'Changed after a review'],
  ['auto:', 'Changed by the engine'],
];

/** A version's reason in plain words; never the raw key. */
export const versionReasonText = (reason: string): string => {
  if (EXACT_REASON[reason]) return EXACT_REASON[reason];
  for (const [prefix, words] of PREFIX_REASON) {
    if (!reason.startsWith(prefix)) continue;
    return prefix === 'restore:v' ? `${words}${reason.slice(prefix.length)}` : words;
  }
  return 'Changed';
};

/** The entry's state at a version, as the list names it. */
export const snapshotStateText = (snapshot: KbEntrySnapshot): string => {
  if (snapshot.sourceDeleted) return 'Source removed';
  if (snapshot.consolidatedInto !== null) return 'In a case';
  if (snapshot.rejectedAt) return 'Turned down';
  if (snapshot.hidden) return 'Hidden';
  return snapshot.approved ? 'Live' : 'Not live yet';
};

const dateText = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
};

/** "a person on 30/10/2026, 10:00" for each later change, joined. */
export const laterChangesText = (later: KbEntryVersion[]): string => {
  const parts = later.map((version) => {
    const who = version.actorKind === 'person' ? 'a person' : ACTOR_LABEL[version.actorKind];
    const when = dateText(version.createdAt);
    return `${who}${when ? ` on ${when}` : ''} (${versionReasonText(version.reason).toLowerCase()})`;
  });
  return parts.join('; ');
};

/** A restore refusal in plain words. */
export const restoreRefusalText = (refusal: KbRestoreRefusal): string => {
  switch (refusal.refused) {
    case 'later_changes':
      return refusal.later.length
        ? `Changed later by ${laterChangesText(refusal.later)}.`
        : 'It was changed later.';
    case 'text_redacted':
      return 'Text removed (personal data): this version cannot be put back.';
    case 'merged_into_case':
      return 'It is merged into a case now: undo the merge, or remove it from the case, first.';
    case 'use_action_undo':
      return `This change has its own undo (${actionOfReason(refusal.action)}): use Undo under Changed by the engine.`;
    default:
      return 'It changed while restoring. Try again.';
  }
};
