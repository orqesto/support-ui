/**
 * The KB cases worklist's row model: labels, the KB list's shape for one row (so its status
 * badge and action rules apply unchanged), who may do what, and the refusal sentences.
 */
import type { KBEntry } from '@/services/kb.service';
import {
  WORK_ROWS_MAX_IDS,
  type KbSetAsideReason,
  type KbWorkRow,
  type KbWorkRowStatus,
} from '@/services/kbConsolidation.service';
import { kbRef } from '@/lib/kbConsolidation';
import { REJECTED_RETENTION_DAYS } from '@/lib/kbRejection';

export const SET_ASIDE_REASON_LABEL: Record<KbSetAsideReason, string> = {
  raw_email: 'Raw email',
  awaiting_review: 'Awaiting KB review',
  customer_specific: 'Customer-specific',
  unclassified: 'Not classified',
  no_clear_language: 'No clear language',
  detached: 'Detached from a case',
  classifying: 'Being re-grouped',
  other: 'Set aside (other reason)',
};

/** What a page says after an action: one line, replaced by the next. */
export type KbWorkNotice = { text: string; variant: 'success' | 'info' | 'danger' };

/** Rows asked for at once (and per "Show more"). */
export const WORK_ROWS_PAGE = 50;

/**
 * The KB list's shape for one row — only what the status badge and the action rules read. A
 * rejected row without a date reads "Rejected", as the list does for a rejection it cannot date.
 */
export const REJECTED_UNDATED = 'undated';
/** A case's own entry: the case being listed, or a row the server says is a case. */
export const isCaseEntry = (row: KbWorkRow, caseId: number | null): boolean =>
  row.isCase === true || (caseId !== null && row.id === caseId);

export const asListEntry = (
  row: KbWorkRow,
  caseId: number | null,
  reason?: KbSetAsideReason
): KBEntry => {
  const isCase = isCaseEntry(row, caseId);
  // A detached entry LEFT its case: whatever case id the server still carries, it is not merged
  // (it reads "detached", and can be unhidden like any hidden entry).
  const mergedInto =
    !isCase && reason !== 'detached' && row.caseId !== null && row.caseId !== row.id
      ? row.caseId
      : null;
  return {
    id: row.id,
    type: 'qa_pair',
    title: row.title ?? '',
    content: '',
    category: '',
    departmentId: null,
    qualityScore: 0,
    usageCount: 0,
    createdAt: '',
    approved: row.status === 'approved',
    hidden: row.status === 'hidden' || row.status === 'rejected',
    rejectedAt: row.status === 'rejected' ? (row.rejectedAt ?? REJECTED_UNDATED) : null,
    sourceDeleted: row.sourceDeleted,
    capturedVia: isCase ? 'consolidation' : null,
    canUnmerge: isCase ? row.canDecide : undefined,
    consolidatedInto: mergedInto,
    consolidation:
      mergedInto !== null
        ? { state: 'merged', caseId: mergedInto, casePublicId: row.casePublicId, caseExists: true }
        : null,
  };
};

/** Approve / reject / hide / unhide / edit: `canModerate`, or (older backend) `canDecide`. */
export const mayModerate = (row: KbWorkRow): boolean => row.canModerate ?? row.canDecide;

/** Why a move into a case was refused — the server's `reason` (BE MANUAL_ATTACH_REFUSALS). */
export const ATTACH_REFUSED: Record<string, string> = {
  case_not_live: 'that case is no longer live.',
  entry_gone: 'the entry no longer exists.',
  is_case: 'it is a case itself.',
  already_in_case: 'it is already in a case.',
  rejected: 'it is rejected.',
  hidden: 'it is hidden — unhide it first.',
  source_deleted: 'its source was removed.',
  not_qa_pair: 'only a question-and-answer entry can join a case.',
  other_scope: 'that case serves a different mailbox or department.',
  under_review: 'it has an open KB review — decide that review first.',
};
/** Why taking an entry out of a case was refused (BE detach). */
export const DETACH_REFUSED: Record<string, string> = {
  not_member: 'it is no longer in that case.',
  rejected: 'it is rejected — approve it first, then remove it from the case.',
  last_member:
    'it is the case’s only entry, and a case cannot be left empty. To dissolve it, use Split case on the case’s own row.',
  case_not_live: 'that case is no longer live.',
  entry_gone: 'the entry no longer exists.',
};
export const refusalText = (
  table: Record<string, string>,
  result: { status: number; reason: string | null; message: string | null }
) =>
  (result.reason !== null ? table[result.reason] : undefined) ??
  (result.status === 403
    ? 'you cannot change that case.'
    : (result.message ?? result.reason ?? 'the server refused.'));

/** Its question, else its title, else its number — a blank string is no headline. */
export const headline = (row: KbWorkRow): string =>
  row.question?.trim()
    ? row.question
    : row.title?.trim()
      ? row.title
      : `Entry ${kbRef(row.publicId ?? null, row.id)}`;

export type RowAction = 'approve' | 'reject' | 'hide' | 'unhide' | 'restore';
/** Decisions on the nightly review's own change to an entry (an automatic clean-up, a hold). */
export type QualityAction = 'undoClean' | 'keepUsing' | 'rejectHeld';
export type BusyAction = RowAction | 'move' | 'detach' | 'unmerge' | QualityAction;

/**
 * What each button does, in the words of what the AI then does with the answer (it uses only
 * approved entries that are not hidden; a pending entry is never used). Shown as its tooltip.
 */
export const ACTION_TIPS = {
  approve: 'The AI may use this answer. Hide undoes it.',
  reject: `Never used: deleted after ${REJECTED_RETENTION_DAYS} days. Approve restores it until then.`,
  hide: 'Out of use, not deleted. Unhide restores it as it was.',
  unhide: 'Restores it exactly as it was before it was hidden.',
  restore: 'Approve it again: the AI may use this answer.',
  edit: 'Change the question or answer text.',
  move: 'Join a case: answered with the case’s standard answer.',
  detach: 'Take it out of the case; the case stays.',
  split: 'Undo this case: its original entries come back on their own',
  undoClean: 'Put back the original text from before the clean-up.',
  keepUsing: 'The AI uses this answer again, as it is.',
  rejectHeld: `Never used: deleted after ${REJECTED_RETENTION_DAYS} days.`,
} as const;

/** The one line above every entry list: what the buttons do (Move only where it is offered). */
export const actionsHelp = (withMove: boolean): string =>
  'The AI uses only approved answers. Approve: it may use the answer. Reject: never used, deleted ' +
  `after ${REJECTED_RETENTION_DAYS} days. Hide: out of use until Unhide. Edit: change the text. ` +
  (withMove ? 'Move into case: answered with that case’s standard answer. ' : '') +
  'Pending answers are never used.';

export const QUALITY_FAILED: Record<QualityAction, string> = {
  undoClean: 'Could not undo the clean-up',
  keepUsing: 'Could not keep using it',
  rejectHeld: 'Could not reject',
};

export const STATUS_AFTER: Record<Exclude<RowAction, 'unhide'>, KbWorkRowStatus> = {
  approve: 'approved',
  restore: 'approved',
  reject: 'rejected',
  hide: 'hidden',
};

export const ACTION_FAILED: Record<RowAction, string> = {
  approve: 'Could not approve',
  restore: 'Could not restore',
  reject: 'Could not reject',
  hide: 'Could not hide',
  unhide: 'Could not unhide',
};

export const chunk = (ids: number[]): number[][] => {
  const out: number[][] = [];
  for (let at = 0; at < ids.length; at += WORK_ROWS_MAX_IDS)
    out.push(ids.slice(at, at + WORK_ROWS_MAX_IDS));
  return out;
};
