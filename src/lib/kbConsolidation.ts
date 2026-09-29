/**
 * KB consolidation (#873) — how a KB list row relates to a merged case.
 *
 * A CASE row is the merged entry (`capturedVia: 'consolidation'`). Hiding, rejecting or deleting
 * it UNMERGES it: the case goes and its originals come back. A merged ORIGINAL is hidden while
 * it belongs to a case — approving, hiding, rejecting or deleting it on its own is refused (409),
 * so the list must not offer those actions.
 */
import type { KBEntry } from '@/services/kb.service';

type ConsolidationFields = Pick<KBEntry, 'capturedVia' | 'consolidatedInto' | 'consolidation'>;

export const isCaseRow = (entry: ConsolidationFields): boolean =>
  entry.capturedVia === 'consolidation';

export const isMergedOriginal = (entry: ConsolidationFields): boolean =>
  entry.consolidation?.state === 'merged' ||
  (entry.consolidatedInto !== undefined && entry.consolidatedInto !== null);

/** "#<public id or id>" of the case a merged/detached original points at. */
export const caseRef = (consolidation: { caseId: number; casePublicId: string | null }): string =>
  `#${consolidation.casePublicId ?? consolidation.caseId}`;

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
