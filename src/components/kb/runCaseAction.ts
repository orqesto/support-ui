/**
 * KB consolidation (#873): run a confirmed Hide / Reject / Delete / Unmerge on a CASE row — all
 * four unmerge it — and say what happened. The request can outlive the render that sent it, so
 * `now()` is read when it ANSWERS: the drawer then open, the URL, the current filters (FE pass 16
 * LOW-1).
 */
import { apiErrorStatus } from '@/lib/apiError';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { logger } from '@/lib/logger';
import { kbService, type KBEntry } from '@/services/kb.service';
import { kbConsolidationService } from '@/services/kbConsolidation.service';

export type CaseActionKind = 'hide' | 'reject' | 'delete' | 'unmerge';

export type CaseActionNow = {
  /** The entry the drawer shows at this moment, if any. */
  selectedId: number | null;
  /** The case that entry is merged into (a drawer on one of this case's ORIGINALS). */
  selectedCaseId: number | null;
  /** Tell the user the outcome: the page's dialog, or a toast once the page is gone. */
  say: (outcome: CaseActionOutcome) => void;
  /** Close the drawer (and drop `?id=` from the URL as it is now). */
  close: () => void;
  /** Re-read the list with the filters as they are now. Never throws. */
  refetch: () => Promise<void>;
};

export type CaseActionOutcome = {
  open: true;
  title: string;
  description: string;
  variant: 'success' | 'error' | 'info';
};

/** The drawer shows the case itself or one of its originals — both are stale once it goes. */
const showsCase = (now: CaseActionNow, caseId: number): boolean =>
  now.selectedId === caseId || now.selectedCaseId === caseId;

export const runCaseAction = async (
  entry: Pick<KBEntry, 'id'>,
  action: CaseActionKind,
  /** Called when the request ANSWERS — never a snapshot taken when it was sent. */
  now: () => CaseActionNow
): Promise<CaseActionOutcome> => {
  try {
    let restored: number | undefined;
    if (action === 'unmerge') restored = (await kbConsolidationService.unmerge(entry.id)).restored;
    else if (action === 'hide') restored = (await kbService.hide(entry.id)).data?.restored;
    else if (action === 'reject') restored = (await kbService.reject(entry.id)).data?.restored;
    else restored = (await kbService.delete(entry.id)).data?.restored;
    // Read the drawer, URL and filters as they are NOW — the user may have opened another
    // entry or changed a filter while this request ran (FE pass 16 LOW-1).
    if (showsCase(now(), entry.id)) now().close();
    // The case row is gone and its originals are back — the page must be re-read, not patched.
    await now().refetch();
    return {
      open: true,
      title: 'Case unmerged',
      description:
        restored === 0
          ? 'The merge was undone. No original entries were left to bring back.'
          : typeof restored === 'number'
            ? `${restored} original ${restored === 1 ? 'entry is' : 'entries are'} back in the knowledge base.`
            : 'Its original entries are back in the knowledge base.',
      variant: 'success',
    };
  } catch (error) {
    logger.error('Failed to unmerge case:', error);
    // Every case action wants the case GONE, so a 404 means it already is: someone else (or a
    // second click of this user) removed it meanwhile. Say so — never "Could not unmerge" —
    // and drop the drawer open on it (FE pass 15 LOW-1, pass 16 LOW-2).
    const gone = apiErrorStatus(error) === 404;
    if (gone && showsCase(now(), entry.id)) now().close();
    // Re-read FIRST (the row is stale either way), then say what happened: a re-read that
    // fails too must not replace that with its own "Failed to Load" (FE pass 15 LOW-2).
    await now().refetch();
    return gone
      ? {
          open: true,
          title: 'Already unmerged',
          description: 'This case was removed meanwhile. The list now shows what is there.',
          variant: 'info',
        }
      : {
          open: true,
          title: 'Could not unmerge',
          description: getApiErrorMessage(error) ?? 'The case was not changed. Try again.',
          variant: 'error',
        };
  }
};
