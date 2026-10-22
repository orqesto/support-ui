import type {
  TicketFilters,
  TicketOwesFilter,
  TicketSortBy,
  TicketSorting,
  TicketThreadsFilter,
  TicketUpdatedFilter,
} from '@/stores/ticketsStore';
import type { TicketPriority, TicketStatus } from '@/types';

const STATUSES: readonly TicketStatus[] = ['pending', 'open', 'in_progress', 'resolved', 'closed'];
const PRIORITIES: readonly TicketPriority[] = ['low', 'medium', 'high', 'critical'];
const OWES: readonly TicketOwesFilter[] = ['yes', 'none'];
const THREADS: readonly TicketThreadsFilter[] = ['0', '1', '2-5', '6+'];
const UPDATED: readonly TicketUpdatedFilter[] = ['1h', '24h', '7d', 'old'];
const SORTS: readonly TicketSortBy[] = [
  'createdAt',
  'updatedAt',
  'priority',
  'status',
  'threads',
  'owed',
];
const LINKED = ['synced_to_jira', 'not_synced'] as const;

const oneOf = <T extends string>(values: readonly T[], raw: string | null): T | undefined =>
  raw !== null && (values as readonly string[]).includes(raw) ? (raw as T) : undefined;

const isSet = (value: string | undefined): value is string => !!value && value !== 'all';

/**
 * The query the list, the board and every view-pill count send for one filter state. `me` is
 * resolved here, at request time, so a saved "Mine" view means whoever is signed in — and when
 * nobody is, the filter is dropped rather than sent as a made-up id.
 */
export const ticketApiFilters = (
  filters: TicketFilters,
  currentUserId: number | null
): Record<string, string> => {
  const api: Record<string, string> = {};
  if (filters.status !== 'all') api.status = filters.status;
  if (filters.priority !== 'all') api.priority = filters.priority;
  if (isSet(filters.categoryId)) api.categoryId = filters.categoryId;
  if (isSet(filters.messageSourceId)) api.messageSourceId = filters.messageSourceId;
  if (isSet(filters.assigneeId)) {
    if (filters.assigneeId === 'unassigned') api.assigneeId = '0';
    else if (filters.assigneeId === 'me') {
      if (currentUserId !== null) api.assigneeId = String(currentUserId);
    } else api.assigneeId = filters.assigneeId;
  }
  if (isSet(filters.labelId)) api.labelId = filters.labelId;
  if (filters.search?.trim()) api.search = filters.search.trim();
  if (filters.linked === 'synced_to_jira') api.syncedToJira = 'true';
  else if (filters.linked === 'not_synced') api.syncedToJira = 'false';
  if (filters.needs) api.needs = filters.needs;
  if (filters.owes) api.owes = filters.owes;
  if (filters.threads) api.threads = filters.threads;
  if (filters.updated) api.updated = filters.updated;
  return api;
};

/** URL → filters and sort. Unknown values are dropped, so a stale or hand-edited link never
 *  produces a filter the API would ignore while the page shows it as active. */
export const filtersFromParams = (
  params: URLSearchParams
): { filters: Partial<TicketFilters>; sorting: TicketSorting | null } => {
  const filters: Partial<TicketFilters> = {};
  const status = oneOf(STATUSES, params.get('status'));
  if (status) filters.status = status;
  const priority = oneOf(PRIORITIES, params.get('priority'));
  if (priority) filters.priority = priority;
  const category = params.get('category');
  if (category) filters.categoryId = category;
  const source = params.get('source');
  if (source) filters.messageSourceId = source;
  const assignee = params.get('assignee');
  if (assignee) filters.assigneeId = assignee;
  const label = params.get('label');
  if (label) filters.labelId = label;
  const linked = oneOf(LINKED, params.get('linked'));
  if (linked) filters.linked = linked;
  const search = params.get('search');
  if (search) filters.search = search;
  if (params.get('needs') === 'yes') filters.needs = 'yes';
  const owes = oneOf(OWES, params.get('owes'));
  if (owes) filters.owes = owes;
  const threads = oneOf(THREADS, params.get('threads'));
  if (threads) filters.threads = threads;
  const updated = oneOf(UPDATED, params.get('updated'));
  if (updated) filters.updated = updated;

  const sortBy = oneOf(SORTS, params.get('sort'));
  const sortOrder = params.get('order') === 'asc' ? 'asc' : 'desc';
  return { filters, sorting: sortBy ? { sortBy, sortOrder } : null };
};

/** Filters and sort → URL (into `params`, which may already hold `id` / `mode`). */
export const filtersToParams = (
  filters: TicketFilters,
  sorting: TicketSorting,
  params: URLSearchParams
): void => {
  if (filters.status !== 'all') params.set('status', filters.status);
  if (filters.priority !== 'all') params.set('priority', filters.priority);
  if (isSet(filters.categoryId)) params.set('category', filters.categoryId);
  if (isSet(filters.messageSourceId)) params.set('source', filters.messageSourceId);
  if (isSet(filters.assigneeId)) params.set('assignee', filters.assigneeId);
  if (isSet(filters.labelId)) params.set('label', filters.labelId);
  if (filters.linked && filters.linked !== 'all') params.set('linked', filters.linked);
  if (filters.search) params.set('search', filters.search);
  if (filters.needs) params.set('needs', filters.needs);
  if (filters.owes) params.set('owes', filters.owes);
  if (filters.threads) params.set('threads', filters.threads);
  if (filters.updated) params.set('updated', filters.updated);
  params.set('sort', sorting.sortBy);
  if (sorting.sortOrder === 'asc') params.set('order', 'asc');
};
