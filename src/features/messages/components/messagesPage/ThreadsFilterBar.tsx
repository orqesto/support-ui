import type { ComponentProps } from 'react';
import type { useNotificationCounts } from '@/hooks/useNotificationCounts';
import type { Count } from '@/lib/listTotals';
import type { ListScope } from '@/services/message.service';
import type { MessagesDisplayMode } from '@/types';
import { defaultFilters, type FilterState } from '../../stores/messagesStore';
import type { useLaneCounts } from '../../hooks/useLaneCounts';
import { MessageFilterBar } from '../filters/MessageFilterBar';
import {
  primaryViewsOn,
  ThreadPrimaryViews,
  TRIAGE_IDS,
  type TriageId,
  TriageMenu,
} from '../list/ThreadViews';
import { quickFilterWouldChange } from '../quickFilterPatch';

type BarProps = ComponentProps<typeof MessageFilterBar>;

type ThreadsFilterBarProps = {
  filters: FilterState;
  activeFilterCount: number;
  clearableFilterCount: number;
  displayMode: MessagesDisplayMode;
  contactsPagination: BarProps['pagination'];
  boardTotal: number;
  boardPartial: boolean;
  pagination: BarProps['pagination'];
  handleFilterChange: BarProps['onFilterChange'];
  handleFilterPatch: (patch: Partial<FilterState>) => void;
  handleCommitSearch: (text: string) => void;
  clearFilters: () => Promise<void>;
  isKanban: boolean;
  patchFilters: (patch: Partial<FilterState>) => void;
  laneCounts: ReturnType<typeof useLaneCounts>['laneCounts'];
  countsRefreshKey: string;
  countsReady: boolean;
  listScope: ListScope | null;
  spamArrivals: number;
  clearArrivalKind: ReturnType<typeof useNotificationCounts>['clearKind'];
};

/** The filter bar with the thread list's views (Needs us / All, the Triage menu). Moved unchanged from MessagesPage. */
export const ThreadsFilterBar = ({
  filters,
  activeFilterCount,
  clearableFilterCount,
  displayMode,
  contactsPagination,
  boardTotal,
  boardPartial,
  pagination,
  handleFilterChange,
  handleFilterPatch,
  handleCommitSearch,
  clearFilters,
  isKanban,
  patchFilters,
  laneCounts,
  countsRefreshKey,
  countsReady,
  listScope,
  spamArrivals,
  clearArrivalKind,
}: ThreadsFilterBarProps) => {
  // ── Messages list v4 views ──
  const needsUsOn = filters.lifecycle === 'needs_us' && (filters.columnId ?? 'all') === 'all';
  const activeTriage = (TRIAGE_IDS as readonly string[]).includes(filters.columnId ?? '')
    ? (filters.columnId as TriageId)
    : null;
  /** A triage lane opens with the other filters kept — the board's column, as the chips did. */
  const triageFilters = (id: TriageId): FilterState => ({
    ...filters,
    columnId: id,
    lifecycle: 'all',
    queue: 'all',
  });
  const selectTriage = (id: TriageId | 'all') => {
    const columnId = id === 'all' ? 'all' : id;
    if (!quickFilterWouldChange(filters, columnId)) return;
    if (id === 'spam') void clearArrivalKind('spam_arrival');
    patchFilters(
      id === 'all'
        ? { ...filters, columnId: 'all', lifecycle: 'all', queue: 'all' }
        : triageFilters(id)
    );
  };
  // A searching scope counted to the backend's cap: every chip number is then "at least".
  const scopeCount = (count: number | undefined): Count | undefined =>
    count === undefined ? undefined : listScope?.capped ? { atLeast: count } : count;
  const triageCounts: Partial<Record<TriageId, Count | undefined>> = {
    not_analysed: scopeCount(listScope?.columnCounts?.not_analysed),
    archived: scopeCount(listScope?.columnCounts?.archived),
    no_lane: scopeCount(listScope?.columnCounts?.no_lane),
    spam: laneCounts.spam,
  };

  return (
    <MessageFilterBar
      filters={filters}
      activeFilterCount={activeFilterCount}
      clearableFilterCount={clearableFilterCount}
      pagination={
        displayMode === 'contacts'
          ? contactsPagination
          : displayMode === 'kanban'
            ? {
                page: 1,
                limit: boardTotal,
                total: boardTotal,
                totalCapped: boardPartial,
                countTimedOut: boardPartial && boardTotal === 0,
              }
            : pagination
      }
      // The count is in the header now, beside the view switch.
      showCount={false}
      onFilterChange={handleFilterChange}
      onFilterPatch={handleFilterPatch}
      onCommitSearch={handleCommitSearch}
      onClearFilters={() => void clearFilters()}
      isKanban={isKanban}
      // Owner, 2026-10-22: the list changes only on Enter or "Search threads for…" —
      // never while a long phrase is still being typed.
      liveSearch={false}
      {...(displayMode === 'threads'
        ? {
            leadingViews: (
              <ThreadPrimaryViews
                needsUsOn={needsUsOn}
                // A typed search is not a filter that takes the list off All: the
                // views below keep it (owner, 2026-11-02).
                allOn={
                  primaryViewsOn(filters, activeFilterCount - (filters.search?.trim() ? 1 : 0)).all
                }
                needsUsCount={laneCounts.needs_us}
                // Both views replace the filters but KEEP the search: an agent who
                // searched under Needs us and pressed All had to type it again.
                onNeedsUs={() =>
                  patchFilters({
                    ...defaultFilters,
                    lifecycle: 'needs_us',
                    search: filters.search,
                  })
                }
                // ⛔ Not `clearFilters`: on the thread list that returns to Needs us
                // (#728), which made All a no-op. All clears to everything.
                onAll={() => patchFilters({ ...defaultFilters, search: filters.search })}
              />
            ),
            countViews: { refreshKey: countsRefreshKey, enabled: countsReady },
            trailingViews: (
              <TriageMenu
                active={activeTriage}
                counts={triageCounts}
                countsAtLeast={listScope?.capped === true}
                arrivals={{ spam: spamArrivals }}
                onSelect={selectTriage}
              />
            ),
          }
        : {})}
    />
  );
};
