import { Fragment, type ComponentProps, type Dispatch, type SetStateAction } from 'react';
import { SearchReadingNotice } from '@/components/shared/SearchReadingNotice';
import { Card, CardContent } from '@/components/ui/Card';
import { LoadingOverlay } from '@/components/ui/LoadingOverlay';
import type { useNotificationCounts } from '@/hooks/useNotificationCounts';
import { hiddenKnown } from '@/lib/listTotals';
import type { MessageThread } from '@/services/message.service';
import type { FilterState, SortingState } from '../../stores/messagesStore';
import type { useMessagesData } from '../../hooks/useMessagesData';
import type { ToggleSelected } from '../bulk/selectMode';
import type { useBulkSelection } from '../bulk/useBulkSelection';
import { ThreadTableHeader } from '../list/ThreadTableHeader';
import { threadSections } from '../list/threadSections';
import { ThreadStatusCell } from '../list/threadTableParts';
import { MessageListItem } from '../MessageListItem';
import { MessagesListCaption } from '../MessagesListCaption';
import { presetToSorting, sortingToPreset } from '../sortPresets';
import type { useListPresentation } from '../useListPresentation';
import { GROUP_KEY } from './messagesPageConstants';

type Data = ReturnType<typeof useMessagesData>;
type Presentation = ReturnType<typeof useListPresentation>;
type Caption = ComponentProps<typeof MessagesListCaption>;

type ThreadListViewProps = {
  listSelectableIds: number[];
  listSelectedCount: number;
  bulkSelection: ReturnType<typeof useBulkSelection>;
  listScope: Caption['scope'];
  pagination: Data['messagesPagination'];
  loading: boolean;
  handleScopeJump: Caption['onScopeJump'];
  arrivalCounts: ReturnType<typeof useNotificationCounts>['counts'];
  clearArrivalKind: ReturnType<typeof useNotificationCounts>['clearKind'];
  filters: FilterState;
  groupByStatus: boolean;
  setGroupByStatus: Dispatch<SetStateAction<boolean>>;
  sorting: SortingState;
  setSorting: (sorting: SortingState) => void;
  density: Presentation['density'];
  setDensity: Presentation['setDensity'];
  layout: Presentation['layout'];
  setLayout: Presentation['setLayout'];
  wideEnoughToSplit: boolean;
  split: boolean;
  searchReading: Data['searchReading'];
  listTimedOut: boolean;
  searching: boolean;
  threads: MessageThread[];
  activeFilterCount: number;
  compactRows: boolean;
  handleFilterPatch: (patch: Partial<FilterState>) => void;
  openThreadId: string | null;
  handleOpenThread: (thread: MessageThread) => Promise<void>;
  toggleListRow: ToggleSelected;
  selectMode: boolean;
  highlightTerms: ComponentProps<typeof MessageListItem>['highlightTerms'];
  pendingThreadId: string | null;
  handleRowReadChanged: (isRead: boolean, thread: MessageThread) => void;
};

/** The thread list: caption, search notice, skeleton / empty state / table / cards. Moved unchanged from MessagesPage. */
export const ThreadListView = ({
  listSelectableIds,
  listSelectedCount,
  bulkSelection,
  listScope,
  pagination,
  loading,
  handleScopeJump,
  arrivalCounts,
  clearArrivalKind,
  filters,
  groupByStatus,
  setGroupByStatus,
  sorting,
  setSorting,
  density,
  setDensity,
  layout,
  setLayout,
  wideEnoughToSplit,
  split,
  searchReading,
  listTimedOut,
  searching,
  threads,
  activeFilterCount,
  compactRows,
  handleFilterPatch,
  openThreadId,
  handleOpenThread,
  toggleListRow,
  selectMode,
  highlightTerms,
  pendingThreadId,
  handleRowReadChanged,
}: ThreadListViewProps) => (
  <div className="space-y-2">
    {/* The caption: select this page · what the view hides · how the list is
          drawn. Above the list and outside the empty-state branch, so the "hidden by
          the current view" sentence survives an empty result. */}
    <MessagesListCaption
      selectableCount={listSelectableIds.length}
      selectedCount={listSelectedCount}
      onSelectPage={() =>
        listSelectedCount === listSelectableIds.length
          ? bulkSelection.deselectMany(listSelectableIds)
          : bulkSelection.selectMany(listSelectableIds)
      }
      scope={listScope}
      shown={pagination.total}
      shownCapped={pagination.totalCapped}
      loading={loading}
      onScopeJump={handleScopeJump}
      arrivals={{
        suspicious: arrivalCounts.suspicious_arrival ?? 0,
        spam: arrivalCounts.spam_arrival ?? 0,
      }}
      onReviewArrivals={(queue) =>
        clearArrivalKind(queue === 'suspicious' ? 'suspicious_arrival' : 'spam_arrival')
      }
      /**
       * Whether the residue row's "clear the view" would change anything. These
       * are exactly the filters that row resets — and `status` belongs in the
       * list because `useMessagesData` drops its widening
       * (`view=active&processed=all`) the moment a lifecycle or queue is set.
       */
      lensActive={
        (filters.lifecycle ?? 'all') !== 'all' ||
        (filters.queue ?? 'all') !== 'all' ||
        (filters.columnId ?? 'all') !== 'all' ||
        (filters.status ?? 'all') !== 'all' ||
        filters.showKBOnly === true
      }
      group={groupByStatus}
      onGroupChange={(next) => {
        setGroupByStatus(next);
        try {
          localStorage.setItem(GROUP_KEY, next ? '1' : '0');
        } catch {
          // Blocked storage: the choice lasts this page only.
        }
      }}
      sortPreset={sortingToPreset(sorting)}
      onSortChange={(value) => setSorting(presetToSorting(value))}
      density={density}
      onDensityChange={setDensity}
      layout={layout}
      onLayoutChange={setLayout}
      canSplit={wideEnoughToSplit}
      narrow={split}
    />

    {/* A search reloads with the previous rows still drawn. Shaded, so they do not
          read as the answer to the new search while it is on its way. */}
    <SearchReadingNotice
      reading={searchReading}
      listTimedOut={listTimedOut}
      elsewhere={hiddenKnown(listScope)}
    />
    <LoadingOverlay active={searching && !loading} label="Searching…">
      {loading ? (
        // Messages list v4 `.skel`: grey-bar rows inside the list's own card, split by
        // hairlines — the shape the rows will take, not five separate cards.
        <Card className="overflow-hidden" aria-busy="true" aria-label="Loading threads">
          {[0, 1, 2, 3, 4].map((idx) => (
            <div
              key={idx}
              className="grid gap-2 py-3 px-4 border-t border-hair first:border-t-0 animate-pulse"
            >
              <div className="w-2/5 h-2.5 bg-muted rounded" />
              <div className="w-3/4 h-2.5 bg-muted rounded" />
              <div className="w-1/2 h-2.5 bg-muted rounded" />
            </div>
          ))}
        </Card>
      ) : threads.length === 0 ? (
        <Card>
          {/* Messages list v4 `.empty`: one line that says what is empty, and where
                the rest is when this view hides some. */}
          <CardContent className="px-5 py-12 text-center text-[13.5px] text-muted-foreground">
            <p>
              {listTimedOut
                ? // Stopped, not empty: the notice above says why.
                  hiddenKnown(listScope) > 0
                  ? 'This view did not finish in time.'
                  : 'Not loaded — it took too long.'
                : activeFilterCount > 0 ||
                    hiddenKnown(listScope) > 0 ||
                    filters.lifecycle === 'needs_us'
                  ? 'No threads match this view.'
                  : 'No threads yet.'}
            </p>
            {hiddenKnown(listScope) > 0 && (
              <p className="mt-2.5 text-[12.5px]">
                {hiddenKnown(listScope).toLocaleString()}{' '}
                {hiddenKnown(listScope) === 1 ? 'is' : 'are'} outside this view — use{' '}
                <b>Not shown</b> above to jump to them.
              </p>
            )}
          </CardContent>
        </Card>
      ) : compactRows ? (
        // Table (Messages list v4): column headers that filter and sort, a hairline
        // between rows, optionally split into status sections.
        <Card padding="none" className="overflow-hidden">
          {!split && (
            <ThreadTableHeader
              filters={filters}
              sorting={sorting}
              onFilterPatch={handleFilterPatch}
              onSort={setSorting}
            />
          )}
          {threadSections(threads, groupByStatus).map(({ thread, section }) => (
            <Fragment key={thread.threadId}>
              {section && (
                <div className="flex gap-2.5 items-center px-4 h-[34px] border-t first:border-t-0 border-border bg-raised text-[12.5px] font-semibold">
                  <ThreadStatusCell status={section.status} />
                  {!section.status && <span>Triage</span>}
                  <span className="font-mono font-medium text-muted-foreground">
                    {section.count}
                  </span>
                </div>
              )}
              <MessageListItem
                key={thread.threadId}
                thread={thread}
                density="compact"
                narrow={split}
                current={split && openThreadId === thread.threadId}
                onOpen={handleOpenThread}
                selected={
                  thread.latestMessage ? bulkSelection.isSelected(thread.latestMessage.id) : false
                }
                onToggleSelected={toggleListRow}
                selectMode={selectMode}
                highlightTerms={highlightTerms}
                pending={pendingThreadId === thread.threadId}
                onReadChanged={handleRowReadChanged}
              />
            </Fragment>
          ))}
        </Card>
      ) : (
        // Comfortable: a card per thread, 8px apart (staging's look, kept).
        <div className="grid gap-2">
          {threads.map((thread) => (
            <MessageListItem
              key={thread.threadId}
              thread={thread}
              current={split && openThreadId === thread.threadId}
              onOpen={handleOpenThread}
              selected={
                thread.latestMessage ? bulkSelection.isSelected(thread.latestMessage.id) : false
              }
              onToggleSelected={toggleListRow}
              selectMode={selectMode}
              highlightTerms={highlightTerms}
              pending={pendingThreadId === thread.threadId}
              onReadChanged={handleRowReadChanged}
            />
          ))}
        </div>
      )}
    </LoadingOverlay>
  </div>
);
