/**
 * One declarative description of every inbox filter, shared by the desktop token bar
 * and the mobile sheet.
 *
 * The old panel hard-coded each control's markup, so adding a filter meant another
 * block in an already-oversized file and the two surfaces drifted apart. Here a filter
 * is data: the bar, the browse menu, the search index, the value panels and the mobile
 * drill-downs are all generated from this list.
 *
 * Every key is a real `FilterState` key that the messages query already sends. Nothing
 * here invents a param the API cannot honour — see the notes on `ageRange` and
 * `receivedAt`, which are two DIFFERENT filters that the design prototype conflated.
 */
import { rangeValue } from './receivedRange';
import type { FilterState } from '@/stores/messagesStore';

export type FilterGroup = 'Queue' | 'Routing' | 'AI & links' | 'Flags';

/** Keys the token bar drives. A subset of FilterState — `status` and
 *  `excludeAwaitingResponse` stay on their own controls (they are view-level toggles,
 *  not user-chosen filters).
 *
 *  `received` is the one key here that is not a single `FilterState` field: it stands
 *  for the three that answer "when did this arrive" (`ageRange` plus the two range
 *  bounds), which are one control and one token to the user. `receivedValue` reads it
 *  and `RECEIVED_KEYS` clears it. */
export type FilterKey =
  | 'search'
  | 'threadStatus'
  | 'lifecycle'
  | 'queue'
  | 'read'
  | 'priority'
  | 'assigneeId'
  | 'received'
  | 'receivedAt'
  | 'messageSourceId'
  | 'departmentId'
  | 'aiState'
  | 'linked'
  | 'labelId'
  | 'slaBreached'
  | 'slaAtRisk'
  | 'hasAttachments';

export type FilterOption = {
  value: string;
  label: string;
  /** Swatch colour — priorities, departments, labels and thread statuses carry one. */
  dot?: string;
  /** Sub-heading in the value list (message sources group by channel). */
  section?: string;
  /**
   * Muted trailing detail — volume, provenance, anything that separates a real option
   * from a one-off. The "Received at" list uses it to say how many conversations an
   * address carries and whether our own server recorded it taking delivery, which is
   * the difference between an alias and a stranger who was once cc'd.
   */
  hint?: string;
};

export type FilterDef = {
  key: FilterKey;
  label: string;
  group: FilterGroup;
  /** `select` picks one option · `flag` is an on/off pill · `free` is the search text ·
   *  `date` is a bucket OR an explicit range. */
  kind: 'select' | 'flag' | 'free' | 'date';
  /** Several values at once, sent as a CSV the API turns into an `IN (…)`. Picking is a
   *  toggle rather than a replace, and the panel stays open. */
  multi?: boolean;
  /** Offers `is` / `is not`. Only three filters can be inverted server-side — see
   *  `NEGATABLE_KEYS`, which is the list the API honours. */
  negatable?: boolean;
  /** Hidden in kanban mode — the board's columns ARE these filters. */
  listOnly?: boolean;
  /** Only meaningful in kanban mode. */
  kanbanOnly?: boolean;
  /** Setting this filter clears that one; they partition disjoint sets and a
   *  combination of the two always matches nothing. */
  exclusiveWith?: FilterKey;
  /** Shown above the value list — the AI states are not self-explanatory. */
  help?: string;
  tone?: 'red' | 'amber';
  options?: FilterOption[];
  /** A second choice that only applies once the parent has a value. */
  sub?: { key: 'linkedTicketStatus'; label: string; options: FilterOption[] };
};

const LIFECYCLE: FilterOption[] = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'awaiting', label: 'Pending' },
  { value: 'pending', label: 'On-hold' },
  { value: 'resolved', label: 'Resolved' },
];

/**
 * Kanban's own status filter. NO 'resolved' — the prototype offers one, but
 * `ThreadStatusFilter` has never had it and the URL layer would drop it, so the option
 * would look available and quietly do nothing. Kanban's Resolved COLUMN is a different
 * mechanism; this is the filter.
 */
const THREAD_STATUS: FilterOption[] = [
  { value: 'open', label: 'Open', dot: '#0ea5e9' },
  { value: 'in_progress', label: 'In Progress', dot: '#3b82f6' },
  { value: 'pending', label: 'On-hold', dot: '#fbbf24' },
  { value: 'closed', label: 'Closed' },
];

const QUEUE: FilterOption[] = [
  { value: 'not_analysed', label: 'Not Analysed' },
  { value: 'archived', label: 'Archived' },
  { value: 'suspicious', label: 'Suspicious' },
  { value: 'spam', label: 'Spam' },
];

const READ: FilterOption[] = [
  { value: 'unread', label: 'Unread' },
  { value: 'read', label: 'Read' },
];

const PRIORITY: FilterOption[] = [
  { value: 'low', label: 'Low', dot: '#22c55e' },
  { value: 'medium', label: 'Medium', dot: '#eab308' },
  { value: 'high', label: 'High', dot: '#f97316' },
  { value: 'critical', label: 'Critical', dot: '#ef4444' },
];

/**
 * Age buckets, mapped to the API's `ageRange` enum.
 *
 * These four are the API's own, which is why there is no "Today" among them. Anything
 * they cannot express — a single day, a week in March — is now the explicit range that
 * shares this control; see `receivedRange.ts`.
 */
export const AGE_RANGE: FilterOption[] = [
  { value: 'lt24h', label: 'Last 24 hours' },
  { value: '1to7d', label: '1–7 days' },
  { value: '1to4w', label: '1–4 weeks' },
  { value: 'gt1mo', label: 'Over a month' },
];

const AI_STATE: FilterOption[] = [
  { value: 'needs_review', label: 'Needs Review' },
  { value: 'needs_info', label: 'Needs Info' },
  { value: 'ai_suggested', label: 'AI Suggested' },
  { value: 'bot_handled', label: 'Bot Handled' },
  { value: 'lead', label: 'Lead' },
  { value: 'contradiction', label: 'Contradiction' },
];

const LINKED: FilterOption[] = [
  { value: 'has_ticket', label: 'Has Ticket' },
  { value: 'has_jira', label: 'Has Jira' },
];

const LINKED_TICKET_STATUS: FilterOption[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

const AI_STATE_HELP =
  'Needs Review — AI flagged it for a human · AI Suggested — a draft is ready to send · ' +
  'Bot Handled — resolved autonomously · Lead — identified as a business lead · ' +
  'Contradiction — the message conflicts with an earlier statement.';

/** Options that come from the workspace rather than a constant. */
export type DynamicOptions = {
  assignees: FilterOption[];
  departments: FilterOption[];
  sources: FilterOption[];
  labels: FilterOption[];
  /** Addresses of ours that mail actually arrived at. */
  aliases: FilterOption[];
};

export const EMPTY_DYNAMIC_OPTIONS: DynamicOptions = {
  assignees: [],
  departments: [],
  sources: [],
  labels: [],
  aliases: [],
};

/**
 * The filter list, with workspace-specific options folded in.
 *
 * A `select` filter with no options is dropped: an empty picker is a dead end, and the
 * old panel's habit of rendering one is why a workspace with no labels could not reach
 * its own label filter.
 */
export const buildFilterDefs = (dynamic: DynamicOptions): FilterDef[] => {
  const defs: FilterDef[] = [
    { key: 'search', label: 'Search', group: 'Queue', kind: 'free' },
    {
      key: 'threadStatus',
      label: 'Status',
      group: 'Queue',
      kind: 'select',
      kanbanOnly: true,
      options: THREAD_STATUS,
    },
    {
      key: 'lifecycle',
      label: 'Status',
      group: 'Queue',
      kind: 'select',
      listOnly: true,
      negatable: true,
      options: LIFECYCLE,
    },
    {
      key: 'queue',
      label: 'Queue',
      group: 'Queue',
      kind: 'select',
      listOnly: true,
      negatable: true,
      exclusiveWith: 'lifecycle',
      options: QUEUE,
    },
    { key: 'read', label: 'Read', group: 'Queue', kind: 'select', listOnly: true, options: READ },
    {
      key: 'priority',
      label: 'Priority',
      group: 'Queue',
      kind: 'select',
      multi: true,
      options: PRIORITY,
    },
    {
      key: 'assigneeId',
      label: 'Assignee',
      group: 'Queue',
      kind: 'select',
      options: dynamic.assignees,
    },
    // Buckets AND an explicit range, one control. `kind: 'date'` is what tells the
    // panels to render the second half; the four buckets are still the quick path.
    { key: 'received', label: 'Received', group: 'Queue', kind: 'date', options: AGE_RANGE },
    {
      key: 'messageSourceId',
      label: 'Source',
      group: 'Routing',
      kind: 'select',
      options: dynamic.sources,
    },
    // NOT a date filter, despite the key: the address the mail was delivered to. One
    // mailbox answers to info@, sales@ and support@, so `messageSourceId` cannot
    // separate them — and the label has to say so, or it reads like a timestamp.
    //
    // It was "Sent to", which read as mail WE sent — the opposite of what this selects.
    // That ambiguity cost a round of confusion about whether the list should be built
    // from the From header instead. "Delivered to" states the direction outright.
    {
      key: 'receivedAt',
      label: 'Delivered to',
      group: 'Routing',
      kind: 'select',
      options: dynamic.aliases,
    },
    {
      key: 'departmentId',
      label: 'Department',
      group: 'Routing',
      kind: 'select',
      options: dynamic.departments,
    },
    {
      key: 'aiState',
      label: 'AI State',
      group: 'AI & links',
      kind: 'select',
      negatable: true,
      help: AI_STATE_HELP,
      options: AI_STATE,
    },
    {
      key: 'linked',
      label: 'Linked',
      group: 'AI & links',
      kind: 'select',
      options: LINKED,
      sub: { key: 'linkedTicketStatus', label: 'Ticket status', options: LINKED_TICKET_STATUS },
    },
    {
      key: 'labelId',
      label: 'Label',
      group: 'AI & links',
      kind: 'select',
      multi: true,
      options: dynamic.labels,
    },
    { key: 'slaBreached', label: 'SLA Breach', group: 'Flags', kind: 'flag', tone: 'red' },
    { key: 'slaAtRisk', label: 'SLA At Risk', group: 'Flags', kind: 'flag', tone: 'amber' },
    { key: 'hasAttachments', label: 'Attachments', group: 'Flags', kind: 'flag' },
  ];

  return defs.filter((def) => def.kind !== 'select' || (def.options?.length ?? 0) > 0);
};

/**
 * Which filters belong to which board mode — the single source for both the schema
 * flags below and `viewAppliesTo`.
 *
 * LIST_ONLY exists because every kanban column hard-sets its own `lifecycle` (and uses
 * `view` for the queue axis) and a column's own filters win over the shared ones. Those
 * three cannot move a card on the board no matter what the bar sends.
 */
export const LIST_ONLY_KEYS: FilterKey[] = ['lifecycle', 'queue', 'read'];
export const KANBAN_ONLY_KEYS: FilterKey[] = ['threadStatus'];

/** Does a filter key do anything in this mode? Independent of whether its OPTIONS have
 *  loaded — that is a separate, temporary condition. */
export const keyAppliesInMode = (key: string, isKanban: boolean): boolean =>
  isKanban
    ? !(LIST_ONLY_KEYS as string[]).includes(key)
    : !(KANBAN_ONLY_KEYS as string[]).includes(key);

/** Filters usable in the current board mode. */
export const visibleDefs = (defs: FilterDef[], isKanban: boolean): FilterDef[] =>
  defs.filter((def) => keyAppliesInMode(def.key, isKanban));

export const GROUP_ORDER: FilterGroup[] = ['Queue', 'Routing', 'AI & links', 'Flags'];

/** `'all'` and `''` are how this codebase spells "no filter". */
export const isUnset = (value: unknown): boolean =>
  value === undefined || value === null || value === '' || value === 'all' || value === false;

/** The three `FilterState` fields behind the one `received` control. */
export const RECEIVED_KEYS = ['ageRange', 'receivedFrom', 'receivedTo'] as const;

/**
 * "When did it arrive", as one value: the bucket if a bucket is set, otherwise the
 * explicit range. Never both — the panels clear one when setting the other, so this
 * preferring the bucket is a tiebreak that should not come up.
 */
export const receivedValue = (filters: FilterState): string | undefined => {
  if (filters.ageRange && filters.ageRange !== 'all') return filters.ageRange;
  if (filters.receivedFrom || filters.receivedTo)
    return rangeValue(filters.receivedFrom, filters.receivedTo);
  return undefined;
};

export const filterValue = (filters: FilterState, key: FilterKey): string | undefined => {
  if (key === 'received') return receivedValue(filters);
  const raw = (filters as Record<string, unknown>)[key];
  if (isUnset(raw)) return undefined;
  return raw === true ? 'true' : String(raw);
};

// ── multi-value ─────────────────────────────────────────────────────────────

/** A CSV field's values. `'all'` and `''` both mean none, so both come back empty. */
export const csvValues = (raw: unknown): string[] =>
  typeof raw === 'string' && !isUnset(raw)
    ? [...new Set(raw.split(',').map((part) => part.trim()).filter(Boolean))]
    : [];

/** Add or remove one value, back in the CSV form the API reads. Empty clears to `'all'`. */
export const toggleCsvValue = (raw: unknown, value: string): string => {
  const values = csvValues(raw);
  const next = values.includes(value)
    ? values.filter((entry) => entry !== value)
    : [...values, value];
  return next.length > 0 ? next.join(',') : 'all';
};

/** Is this one of the picked values? Works for single-valued filters too, where the CSV
 *  happens to have one entry. */
export const isPicked = (raw: unknown, value: string): boolean => csvValues(raw).includes(value);

// ── negation ────────────────────────────────────────────────────────────────

/**
 * The filters the API can invert — `NEGATABLE_FILTERS` in `filterPredicates.ts`.
 * Anything else in `negate` is dropped server-side, so offering it would be a control
 * that visibly does nothing.
 */
export const NEGATABLE_KEYS = ['lifecycle', 'queue', 'aiState'] as const;
export type NegatableKey = (typeof NEGATABLE_KEYS)[number];

export const isNegated = (filters: FilterState, key: string): boolean =>
  csvValues(filters.negate).includes(key);

/** The `negate` CSV with one key switched on or off. Empty is `''`, not `'all'` — this
 *  is a list of names, and `'all'` would name a filter that does not exist. */
export const withNegation = (filters: FilterState, key: string, on: boolean): string => {
  const current = csvValues(filters.negate).filter((entry) => entry !== key);
  return (on ? [...current, key] : current).join(',');
};
