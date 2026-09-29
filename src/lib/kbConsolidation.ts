/**
 * KB consolidation (#873) — how a KB list row relates to a merged case.
 *
 * A CASE row is the merged entry (`capturedVia: 'consolidation'`). Hiding, rejecting or deleting
 * it UNMERGES it: the case goes and its originals come back. A merged ORIGINAL is hidden while
 * it belongs to a case — approving, hiding, rejecting or deleting it on its own is refused (409),
 * so the list must not offer those actions.
 */
import type { KBEntry } from '@/services/kb.service';

type ConsolidationFields = Pick<
  KBEntry,
  'capturedVia' | 'consolidatedInto' | 'consolidation' | 'sourceDeleted'
>;

/**
 * Its source was removed: kept for the record, never used — whatever `approved` / `hidden` say.
 * A case (or an original) of a removed source is not live, so it must not read or act as one.
 */
export const isSourceRemoved = (entry: Pick<KBEntry, 'sourceDeleted'>): boolean =>
  entry.sourceDeleted === true;

export const isCaseRow = (entry: ConsolidationFields): boolean =>
  entry.capturedVia === 'consolidation';

export const isMergedOriginal = (entry: ConsolidationFields): boolean =>
  entry.consolidation?.state === 'merged' ||
  (entry.consolidatedInto !== undefined && entry.consolidatedInto !== null);

/**
 * How every KB entry or case is named on screen: "#KB-9" — the same as the KB list and its
 * badges. The row id ("#9") only when the entry has no public id yet.
 */
export const kbRef = (publicId: string | null | undefined, id: number): string =>
  `#${publicId ?? id}`;

/** "#<public id or id>" of the case a merged/detached original points at. */
export const caseRef = (consolidation: { caseId: number; casePublicId: string | null }): string =>
  kbRef(consolidation.casePublicId, consolidation.caseId);

/**
 * A merge proposal was decided in THIS tab. The bell's merge row counts pending proposals; the
 * server re-counts and says so on the socket, but a tab whose socket is down would keep the old
 * number — so the decision is also announced locally and the bell re-reads its row.
 */
export const KB_CONSOLIDATION_DECIDED_EVENT = 'kb-consolidation:decided';

export const announceKbConsolidationDecided = (): void => {
  window.dispatchEvent(new Event(KB_CONSOLIDATION_DECIDED_EVENT));
};

/** Where a case opens: the KB list's own detail drawer, by id. */
export const caseHref = (caseId: number): string => `/knowledge-base?id=${caseId}`;

/**
 * The confirm text before an action that unmerges a case. The KB list does not say how many
 * originals a case holds, so the count is only named when the caller knows it.
 */
export const unmergeConsequence = (restoreCount?: number | null): string =>
  typeof restoreCount === 'number'
    ? `This restores ${restoreCount} original ${restoreCount === 1 ? 'entry' : 'entries'}`
    : 'This restores its original entries';

/**
 * Approve / Reject / Hide / Unhide / Edit act on an entry the AI serves or may serve.
 * Not offered on a merged original (the server refuses, 409) nor on a source-removed entry
 * (nothing it would change is ever used). Delete and Unmerge are decided separately: bringing a
 * retired case's originals back is legitimate, and the server allows it.
 */
export const offersReviewActions = (entry: ConsolidationFields): boolean =>
  !isMergedOriginal(entry) && !isSourceRemoved(entry);
