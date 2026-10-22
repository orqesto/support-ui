import { defaultFilters, type TicketFilters } from '@/stores/ticketsStore';
import type { TicketPriority, TicketStatus } from '@/types';

export const STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  pending: 'Pending',
  resolved: 'Resolved',
  closed: 'Closed',
};

/** Lane, group and menu order. */
export const STATUS_ORDER: TicketStatus[] = [
  'open',
  'in_progress',
  'pending',
  'resolved',
  'closed',
];

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export type TicketFilterOption = { value: string; label: string; dot?: string };

/** One filterable field: its chip name and the values the menu offers. */
export type TicketFilterKey = {
  field: keyof TicketFilters;
  label: string;
  options: TicketFilterOption[];
};

export type TicketFilterSources = {
  assignees: Array<{ id: number; name: string }>;
  categories: Array<{ id: number; name: string }>;
  labels: Array<{ id: number; name: string; color: string }>;
  /** The Jira filter only exists where a Jira integration does. */
  jiraOn: boolean;
};

export const buildTicketFilterKeys = ({
  assignees,
  categories,
  labels,
  jiraOn,
}: TicketFilterSources): TicketFilterKey[] => {
  const keys: TicketFilterKey[] = [
    {
      field: 'status',
      label: 'Status',
      options: STATUS_ORDER.map((status) => ({ value: status, label: STATUS_LABELS[status] })),
    },
    {
      field: 'priority',
      label: 'Priority',
      options: (Object.keys(PRIORITY_LABELS) as TicketPriority[]).map((priority) => ({
        value: priority,
        label: PRIORITY_LABELS[priority],
      })),
    },
    {
      field: 'assigneeId',
      label: 'Assignee',
      options: [
        { value: 'me', label: 'Me' },
        { value: 'unassigned', label: 'Unassigned' },
        ...assignees.map((user) => ({ value: String(user.id), label: user.name })),
      ],
    },
    {
      field: 'categoryId',
      label: 'Category',
      options: categories.map((category) => ({ value: String(category.id), label: category.name })),
    },
    {
      field: 'labelId',
      label: 'Label',
      options: labels.map((label) => ({
        value: String(label.id),
        label: label.name,
        dot: label.color,
      })),
    },
  ];
  if (jiraOn) {
    keys.push({
      field: 'linked',
      label: 'Jira',
      options: [
        { value: 'synced_to_jira', label: 'Synced to Jira' },
        { value: 'not_synced', label: 'Not synced' },
      ],
    });
  }
  keys.push(
    {
      field: 'threads',
      label: 'Threads',
      options: [
        { value: '0', label: 'No threads' },
        { value: '1', label: '1 thread' },
        { value: '2-5', label: '2–5 threads' },
        { value: '6+', label: '6 or more' },
      ],
    },
    {
      field: 'owes',
      label: 'Owed',
      options: [
        { value: 'yes', label: 'Customers still owed a reply' },
        { value: 'none', label: 'Nobody owed' },
      ],
    },
    {
      field: 'needs',
      label: 'Needs us',
      options: [{ value: 'yes', label: 'Open · in progress · owed' }],
    },
    {
      field: 'updated',
      label: 'Updated',
      options: [
        { value: '1h', label: 'In the last hour' },
        { value: '24h', label: 'In the last 24 hours' },
        { value: '7d', label: 'In the last 7 days' },
        { value: 'old', label: 'More than 7 days ago' },
      ],
    }
  );
  return keys;
};

/** The value a filter field holds, or undefined when it is not set. */
export const filterValue = (
  filters: TicketFilters,
  field: keyof TicketFilters
): string | undefined => {
  const value = filters[field];
  return value && value !== 'all' ? value : undefined;
};

/** `filters` with one field cleared back to its default. */
export const withoutFilter = (
  filters: TicketFilters,
  field: keyof TicketFilters
): TicketFilters => {
  const next: Record<string, unknown> = { ...filters };
  const fallback = defaultFilters[field];
  if (fallback === undefined) delete next[field];
  else next[field] = fallback;
  return next as TicketFilters;
};
