/**
 * KB consolidation (#873) — how a KB list row relates to a merged case.
 *
 * A CASE row is the merged entry (`capturedVia: 'consolidation'`). Hiding, rejecting or deleting
 * it UNMERGES it: the case goes and its originals come back. A merged ORIGINAL is hidden while
 * it belongs to a case — approving, hiding, rejecting or deleting it on its own is refused (409),
 * so the list must not offer those actions.
 */
import type { KBEntry } from '@/features/kb/services/kb.service';

type ConsolidationFields = Pick<
  KBEntry,
  'capturedVia' | 'consolidatedInto' | 'consolidation' | 'sourceDeleted' | 'canUnmerge'
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

/** Where an entry opens: the KB list's own detail drawer, by row id. */
export const entryHref = (id: number): string => `/knowledge-base?id=${id}`;

/** At most this many entries are named in a confirm or outcome; the rest are counted. */
export const MAX_NAMED_ENTRIES = 10;

/** "#KB-12 Refund window" — a title cut to one line's worth. */
export const namedEntry = (entry: { id: number; publicId: string | null; title: string }): string => {
  const title = entry.title.trim();
  const short = title.length > 70 ? `${title.slice(0, 69).trimEnd()}…` : title;
  return short ? `${kbRef(entry.publicId, entry.id)} ${short}` : kbRef(entry.publicId, entry.id);
};

/**
 * What a case action says it brought back, entry by entry (`restoredEntries`), one per line;
 * null when the backend named none — the caller then says the count only.
 */
export const restoredEntriesText = (
  entries: { id: number; publicId: string | null; title: string }[] | null | undefined
): string | null => {
  // None named: the count says it (0 ⇒ "none were left"), never a list that claims nothing came back.
  if (!entries?.length) return null;
  const named = entries.slice(0, MAX_NAMED_ENTRIES).map(namedEntry);
  const more = entries.length - named.length;
  return [
    `${entries.length} original ${entries.length === 1 ? 'entry is' : 'entries are'} back in the knowledge base:`,
    ...named,
    ...(more > 0 ? [`and ${more} more`] : []),
    'Search a number to open it.',
  ].join('\n');
};

/**
 * Approve / Reject / Hide / Unhide / Edit act on an entry the AI serves or may serve.
 * Not offered on a merged original (the server refuses, 409) nor on a source-removed entry
 * (nothing it would change is ever used). Delete and Unmerge are decided separately: bringing a
 * retired case's originals back is legitimate, and the server allows it.
 */
export const offersReviewActions = (entry: ConsolidationFields): boolean =>
  !isMergedOriginal(entry) && !isSourceRemoved(entry);

/**
 * Hide / Reject / Delete / Unmerge on a CASE row all unmerge it, and the server lets only a
 * moderator covering the case's whole scope do that — it sends `canUnmerge` on each case row
 * (FE AUD14 MED-1: a department moderator was offered them on a shared mailbox's case and got a
 * 403). Absent on an older backend ⇒ offered; the server still decides. Not a case ⇒ true.
 */
export const mayRemoveCase = (entry: ConsolidationFields): boolean =>
  !isCaseRow(entry) || entry.canUnmerge !== false;
