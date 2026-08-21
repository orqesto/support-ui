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
import type { FilterState } from '@/stores/messagesStore';

export type FilterGroup = 'Queue' | 'Routing' | 'AI & links' | 'Flags';

/** Keys the token bar drives. A subset of FilterState — `status` and
 *  `excludeAwaitingResponse` stay on their own controls (they are view-level toggles,
 *  not user-chosen filters). */
export type FilterKey =
  | 'search'
  | 'threadStatus'
  | 'lifecycle'
  | 'queue'
  | 'read'
  | 'priority'
  | 'assigneeId'
  | 'ageRange'
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
};

export type FilterDef = {
  key: FilterKey;
  label: string;
  group: FilterGroup;
  /** `select` picks one option · `flag` is an on/off pill · `free` is the search text. */
  kind: 'select' | 'flag' | 'free';
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
 * The prototype called this "Received" with Today / 24h / 7d / 30d. The API's buckets
 * are the ones below and there is no "today", so these are the real four rather than
 * four that would need a new param to mean anything.
 */
const AGE_RANGE: FilterOption[] = [
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
      options: LIFECYCLE,
    },
    {
      key: 'queue',
      label: 'Queue',
      group: 'Queue',
      kind: 'select',
      listOnly: true,
      exclusiveWith: 'lifecycle',
      options: QUEUE,
    },
    { key: 'read', label: 'Read', group: 'Queue', kind: 'select', listOnly: true, options: READ },
    { key: 'priority', label: 'Priority', group: 'Queue', kind: 'select', options: PRIORITY },
    {
      key: 'assigneeId',
      label: 'Assignee',
      group: 'Queue',
      kind: 'select',
      options: dynamic.assignees,
    },
    { key: 'ageRange', label: 'Received', group: 'Queue', kind: 'select', options: AGE_RANGE },
    {
      key: 'messageSourceId',
      label: 'Source',
      group: 'Routing',
      kind: 'select',
      options: dynamic.sources,
    },
    // NOT a date filter, despite the name: the address the mail was delivered to. One
    // mailbox answers to info@, sales@ and support@, so `messageSourceId` cannot
    // separate them. Labelled "Sent to" so it stops reading like a timestamp.
    {
      key: 'receivedAt',
      label: 'Sent to',
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
    { key: 'labelId', label: 'Label', group: 'AI & links', kind: 'select', options: dynamic.labels },
    { key: 'slaBreached', label: 'SLA Breach', group: 'Flags', kind: 'flag', tone: 'red' },
    { key: 'slaAtRisk', label: 'SLA At Risk', group: 'Flags', kind: 'flag', tone: 'amber' },
    { key: 'hasAttachments', label: 'Attachments', group: 'Flags', kind: 'flag' },
  ];

  return defs.filter((def) => def.kind !== 'select' || (def.options?.length ?? 0) > 0);
};

/** Filters usable in the current board mode. */
export const visibleDefs = (defs: FilterDef[], isKanban: boolean): FilterDef[] =>
  defs.filter((def) => (isKanban ? !def.listOnly : !def.kanbanOnly));

export const GROUP_ORDER: FilterGroup[] = ['Queue', 'Routing', 'AI & links', 'Flags'];

/** `'all'` and `''` are how this codebase spells "no filter". */
export const isUnset = (value: unknown): boolean =>
  value === undefined || value === null || value === '' || value === 'all' || value === false;

export const filterValue = (filters: FilterState, key: FilterKey): string | undefined => {
  const raw = (filters as Record<string, unknown>)[key];
  if (isUnset(raw)) return undefined;
  return raw === true ? 'true' : String(raw);
};
