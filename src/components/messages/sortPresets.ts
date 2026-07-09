import type { SortingState } from '@/stores/messagesStore';

// Shared sort presets — used by the standalone list-view Sort control
// (MessagesPage) and by the per-column sort in MessagesKanbanView. Single source
// of truth for the preset ↔ {sortBy, sortOrder} mapping. Each field offers both
// directions (priority high/low, SLA most/least urgent).
export const SORT_PRESET_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'priority', label: 'Highest Priority' },
  { value: 'priority_low', label: 'Lowest Priority' },
  { value: 'sla', label: 'SLA: Most Urgent' },
  { value: 'sla_low', label: 'SLA: Least Urgent' },
];

export const sortingToPreset = (sorting: SortingState): string => {
  if (sorting.sortBy === 'priority') return sorting.sortOrder === 'asc' ? 'priority_low' : 'priority';
  if (sorting.sortBy === 'sla') return sorting.sortOrder === 'desc' ? 'sla_low' : 'sla';
  return sorting.sortOrder === 'asc' ? 'oldest' : 'newest';
};

export const presetToSorting = (value: string): SortingState => {
  switch (value) {
    case 'priority':
      return { sortBy: 'priority', sortOrder: 'desc' };
    case 'priority_low':
      return { sortBy: 'priority', sortOrder: 'asc' };
    case 'sla':
      return { sortBy: 'sla', sortOrder: 'asc' };
    case 'sla_low':
      return { sortBy: 'sla', sortOrder: 'desc' };
    case 'oldest':
      return { sortBy: 'time', sortOrder: 'asc' };
    default:
      return { sortBy: 'time', sortOrder: 'desc' };
  }
};
