import { BaseFiltersLayout } from '@/components/filters/BaseFiltersLayout';
import { MessageSourceFilter } from '@/components/filters/MessageSourceFilter';
import { SegmentedFilter } from '@/components/filters/SegmentedFilter';
import { SortOrderFilter } from '@/components/filters/SortOrderFilter';
import { ChannelFilter } from '@/components/messages/ChannelFilter';
import { MESSAGE_CATEGORY_FILTER_OPTIONS } from '@/constants/messageCategories';

import type { SpamLogFilters as SpamLogFiltersType } from '@/services/spamLog.service';

type SpamLogFiltersProps = {
  filters: SpamLogFiltersType;
  pendingSearch: string;
  activeFilterCount: number;
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
  onFilterChange: (key: string, value: string | number | boolean | undefined) => void;
  onSearch: () => void;
  onSearchBlur: () => void;
  onClearFilters: () => void;
  onSortingChange: (sortOrder: 'asc' | 'desc') => void;
  setPendingSearch: (value: string) => void;
};

export const SpamLogFilters = ({
  filters,
  pagination,
  activeFilterCount,
  pendingSearch,
  setPendingSearch,
  onSearch,
  onSearchBlur,
  onClearFilters,
  onFilterChange,
  onSortingChange,
}: SpamLogFiltersProps) => (
    <BaseFiltersLayout
      title="Spam Logs"
      activeFilterCount={activeFilterCount}
      pagination={pagination}
      searchValue={pendingSearch}
      onSearchChange={setPendingSearch}
      onSearch={onSearch}
      onSearchBlur={onSearchBlur}
      onClearFilters={onClearFilters}
    >
      <div className="p-4 rounded-lg border bg-muted/30">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          {/* Category */}
          <SegmentedFilter
            label="Category"
            value={filters.category ?? ''}
            onChange={(v) => onFilterChange('category', v)}
            options={MESSAGE_CATEGORY_FILTER_OPTIONS}
            mobileRows={[2, 3]}
          />
          <div className="hidden mx-3 w-px h-8 sm:block bg-border" />
          {/* Channel */}
          <ChannelFilter
            value={filters.channel ?? 'all'}
            onChange={(v: string) => onFilterChange('channel', v)}
          />
          <div className="hidden mx-3 w-px h-8 sm:block bg-border" />
          {/* Message Source */}
          <MessageSourceFilter
            value={filters.messageSourceId?.toString()}
            onChange={(v: string) =>
              onFilterChange('messageSourceId', v === 'all' ? '' : Number(v))
            }
            className="min-w-[200px]"
          />
          <div className="hidden mx-3 w-px h-8 sm:block bg-border" />
          
          <div className="hidden mx-3 w-px h-8 sm:block bg-border" />
          {/* Sort */}
          <SortOrderFilter
            value={filters.sortOrder ?? 'desc'}
            onChange={onSortingChange}
          />
        </div>
      </div>
    </BaseFiltersLayout>
  );