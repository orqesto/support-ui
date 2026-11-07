import type { KbListStatus } from '@/services/kb.service';

/** The status filter on the KB page: one list status, or all of them. */
export type KbFilterStatus = 'all' | KbListStatus;
export const KB_FILTER_STATUSES: readonly KbFilterStatus[] = [
  'needs_decision',
  'suggested_change',
  'set_aside',
  'auto_removed',
  'auto_changed',
  'approved',
  'pending',
  'hidden',
  'rejected',
  'deleted',
  'all',
];
