import { defaultFilters, type TicketFilters } from '@/stores/ticketsStore';
import { filtersFromParams } from './ticketFilters';

/** A filter preset as stored: only the filters that are set, by their store field names. */
export type TicketViewFilters = Partial<Record<keyof TicketFilters, string>>;

export type TicketView = {
  /** Server id for a saved view; absent on the built-ins, which belong to nobody. */
  id?: number;
  name: string;
  filters: TicketViewFilters;
  builtIn?: boolean;
};

/** The list opens on this view. */
export const DEFAULT_VIEW_FILTERS: TicketViewFilters = { needs: 'yes' };

export const BUILT_IN_TICKET_VIEWS: TicketView[] = [
  { name: 'Needs us', filters: DEFAULT_VIEW_FILTERS, builtIn: true },
  { name: 'All', filters: {}, builtIn: true },
  { name: 'Mine', filters: { assigneeId: 'me' }, builtIn: true },
  { name: 'Unassigned', filters: { assigneeId: 'unassigned' }, builtIn: true },
  { name: 'Owes reply', filters: { owes: 'yes' }, builtIn: true },
  { name: 'Urgent', filters: { status: 'open', priority: 'critical' }, builtIn: true },
];

// Store field → URL parameter. A view is validated by the same parser a link is, so a stored
// view can never carry a value the list would show as active but the API would ignore.
const FIELD_TO_PARAM: Partial<Record<keyof TicketFilters, string>> = {
  status: 'status',
  priority: 'priority',
  categoryId: 'category',
  messageSourceId: 'source',
  assigneeId: 'assignee',
  labelId: 'label',
  linked: 'linked',
  needs: 'needs',
  owes: 'owes',
  threads: 'threads',
  updated: 'updated',
};

/** The filters a view holds: every set filter except the search text, which is not a view. */
export const viewFiltersOf = (filters: TicketFilters): TicketViewFilters => {
  const out: TicketViewFilters = {};
  for (const field of Object.keys(FIELD_TO_PARAM) as Array<keyof TicketFilters>) {
    const value = filters[field];
    if (value && value !== 'all') out[field] = value;
  }
  return out;
};

/** A stored view applied over the defaults. Keys the tickets list does not know are dropped. */
export const filtersOfView = (stored: Record<string, unknown>): TicketFilters => {
  const params = new URLSearchParams();
  for (const [field, param] of Object.entries(FIELD_TO_PARAM)) {
    const value = stored[field];
    if (typeof value === 'string' && value) params.set(param, value);
  }
  return { ...defaultFilters, ...filtersFromParams(params).filters };
};

const sameFilters = (left: TicketViewFilters, right: TicketViewFilters): boolean => {
  const leftKeys = Object.keys(left) as Array<keyof TicketFilters>;
  return (
    leftKeys.length === Object.keys(right).length &&
    leftKeys.every((key) => left[key] === right[key])
  );
};

/** The view whose filters are EXACTLY the current ones, or null — and null while searching. */
export const activeView = (filters: TicketFilters, views: TicketView[]): TicketView | null => {
  if (filters.search?.trim()) return null;
  const current = viewFiltersOf(filters);
  return views.find((view) => sameFilters(view.filters, current)) ?? null;
};
