import { logger } from '@/lib/logger';
import { kbRef } from '@/lib/kbConsolidation';
import { kbService, type KBEntry, type KbListStatus } from '@/services/kb.service';

const DECISION_STATUSES: Array<'needs_decision' | 'suggested_change'> = [
  'needs_decision',
  'suggested_change',
];

/**
 * The detail route does not send the decision waiting on an entry, only the list does — and a
 * deep link's entry may not be on the page shown. This asks the list for exactly this entry (by
 * its number) under the decision filters, so every link can decide it. Best effort: none found
 * (or an older backend that ignores the filter) ⇒ the entry as it was.
 *
 * @param listed the row on the page already shown, when the entry is on it
 */
export const withPendingDecision = async (
  entry: KBEntry,
  listed: KBEntry | undefined,
  filterStatus: KbListStatus | 'all'
): Promise<KBEntry> => {
  if (entry.pendingDecision) return entry;
  const carry = (row: KBEntry | undefined): KBEntry | null =>
    row?.pendingDecision
      ? {
          ...entry,
          pendingDecision: row.pendingDecision,
          otherPendingDecisions: row.otherPendingDecisions,
        }
      : null;
  const onPage = carry(listed);
  if (onPage) return onPage;
  const statuses =
    filterStatus === 'needs_decision' || filterStatus === 'suggested_change'
      ? [filterStatus]
      : DECISION_STATUSES;
  for (const status of statuses) {
    try {
      const response = await kbService.getAll({
        status,
        search: kbRef(entry.publicId, entry.id),
        limit: 50,
      });
      if (response?.data?.filters?.statusApplied !== true) continue;
      const found = carry(response.data.entries.find((row) => row.id === entry.id));
      if (found) return found;
    } catch (error) {
      logger.error('Failed to look up the decision on a KB entry:', error);
    }
  }
  return entry;
};
