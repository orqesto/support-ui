import { type BulkAction } from '@/lib/bulkActions';

// URL params that are list-view-only filters. Kanban groups by status itself and
// ignores these, so arriving via a filter-bearing link (dashboard cards, or the
// Notification Center's Spam/Suspicious queue rows → ?queue=spam) must force the
// list ("threads") view — otherwise the click looks like a no-op on Kanban.
/**
 * Where a bulk action's cards land on the board, for the actions that move them. The rest
 * (assign, ticket, read state) leave the card in its lane, so the board waits for the re-read.
 */
export const BULK_TARGET_COLUMN: Partial<Record<BulkAction, string>> = {
  resolve: 'resolved',
  resolve_kb: 'resolved',
  spam: 'spam',
};

export const NOTIFY_TRIAGE_KEY = 'threads_notify_triage';
export const GROUP_KEY = 'threads_group';

export const LIST_ONLY_FILTER_PARAMS = [
  'status',
  'threadStatus',
  'slaBreached',
  'slaAtRisk',
  'queue',
  'read',
];
