import type { SortingState } from '@/stores/messagesStore';

// Shared sort presets — used by the standalone list-view Sort control
// (MessagesPage) and by the per-column sort in MessagesKanbanView. Single source
// of truth for the preset ↔ {sortBy, sortOrder} mapping.
export const SORT_PRESET_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'priority', label: 'Highest Priority' },
  { value: 'sla', label: 'SLA: Most Urgent' },
];

export const sortingToPreset = (sorting: SortingState): string =>
  sorting.sortBy === 'priority'
    ? 'priority'
    : sorting.sortBy === 'sla'
      ? 'sla'
      : sorting.sortOrder === 'asc'
        ? 'oldest'
        : 'newest';

export const presetToSorting = (value: string): SortingState =>
  value === 'priority'
    ? { sortBy: 'priority', sortOrder: 'desc' }
    : value === 'sla'
      ? { sortBy: 'sla', sortOrder: 'asc' }
      : value === 'oldest'
        ? { sortBy: 'time', sortOrder: 'asc' }
        : { sortBy: 'time', sortOrder: 'desc' };
