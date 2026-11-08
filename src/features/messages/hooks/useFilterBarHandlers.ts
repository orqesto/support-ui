import { defaultFilters, type FilterState } from '../stores/messagesStore';
import type { MessagesDisplayMode } from '@/types';
import type { useMessagesData } from './useMessagesData';

type Data = ReturnType<typeof useMessagesData>;

/** The filter bar's writes. Plain functions, re-created each render as they were in MessagesPage. */
export const useFilterBarHandlers = ({
  updateFilter,
  patchFilters,
  clearFiltersStore,
  displayMode,
  fetchMessages,
  messagesPagination,
}: {
  updateFilter: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  patchFilters: (patch: Partial<FilterState>) => void;
  clearFiltersStore: () => void;
  displayMode: MessagesDisplayMode;
  fetchMessages: Data['fetchMessages'];
  messagesPagination: Data['messagesPagination'];
}) => {
  const handleFilterChange = (key: string, value: string | boolean) => {
    if (key === 'search') {
      // Setting and clearing are the same write now. The old two-step (stage into
      // pendingSearch, commit on Enter/blur) existed for a controlled text input; the
      // bar hands over a finished term or an empty string.
      updateFilter('search', value as string);
    } else {
      updateFilter(key as keyof FilterState, value as FilterState[keyof FilterState]);
      if (key === 'linked' && value === 'all') {
        updateFilter('linkedTicketStatus', 'all');
      }
    }
  };

  /**
   * Several filter keys in one write.
   *
   * The Received control owns three fields (`ageRange` and the two bounds), turning a
   * negated filter off touches two, and applying a saved view touches as many as it has.
   * Sending those one at a time walks through states nobody chose — a range with only a
   * `from`, a filter that is briefly still inverted — and each is a distinct cache key.
   */
  const handleFilterPatch = (patch: Partial<FilterState>) => {
    patchFilters(patch);
  };

  /**
   * Commit a search term in ONE step.
   *
   * The old panel typed into a controlled input and committed on Enter/blur, so it
   * needed the pendingSearch/onSearch pair. The token bar turns a term into a token in
   * a single action — and calling setPendingSearch then onSearch would not work, since
   * onSearch reads pendingSearch from its closure and would still see the old value.
   */
  const handleCommitSearch = (text: string) => {
    updateFilter('search', text);
  };

  const clearFilters = async () => {
    // The thread list's landing view is Needs us (it is not counted as a filter): "Clear all"
    // returns there, not to All — clearing must not silently widen the list (review of #724).
    if (displayMode === 'threads') {
      patchFilters({ ...defaultFilters, lifecycle: 'needs_us' });
      return;
    }
    clearFiltersStore();
    await fetchMessages(messagesPagination.page, true);
  };

  return { handleFilterChange, handleFilterPatch, handleCommitSearch, clearFilters };
};
