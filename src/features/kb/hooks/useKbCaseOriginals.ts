import { useEffect, useState } from 'react';
import { logger } from '@/lib/logger';
import {
  kbConsolidationService,
  type KbCaseOriginal,
} from '@/features/kb/services/kbConsolidation.service';

/**
 * The originals a case action (Hide / Reject / Delete / Unmerge on a case row) would bring back,
 * read when its confirm opens. `request` is that confirm: each opening is a new object, so an
 * answer is shown only in the dialog that asked for it — never a late one for the previous case,
 * nor the last opening's for this one. Null while loading, on a failure, or on a backend without
 * the route: the confirm then keeps its generic text.
 */
export const useKbCaseOriginals = (
  request: { entry: { id: number } } | null
): KbCaseOriginal[] | null => {
  const [loaded, setLoaded] = useState<{ for: object; originals: KbCaseOriginal[] } | null>(null);
  useEffect(() => {
    if (!request) return;
    let current = true;
    kbConsolidationService
      .getCaseOriginals(request.entry.id)
      .then((answer) => {
        if (current && answer) setLoaded({ for: request, originals: answer.originals });
      })
      .catch((error: unknown) => logger.warn('Could not read the case originals:', error));
    return () => {
      current = false;
    };
  }, [request]);
  return request && loaded?.for === request ? loaded.originals : null;
};
