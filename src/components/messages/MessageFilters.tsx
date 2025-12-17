import { BaseFiltersLayout } from '@/components/filters/BaseFiltersLayout';
import { MessageSourceFilter } from '@/components/filters/MessageSourceFilter';
import { SegmentedFilter } from '@/components/filters/SegmentedFilter';
import { SortOrderFilter } from '@/components/filters/SortOrderFilter';
import { ChannelFilter } from '@/components/messages/ChannelFilter';
import {
  ShieldX,
  Paperclip,
  MessageCircle,
  Ticket,
  XCircle,
  Clock,
  BookOpen,
} from 'lucide-react';
import type { FilterState } from '@/stores/messagesStore';
import { AdvancedFiltersToggle } from '@/components/filters/AdvancedFiltersToggle';
import { useState } from 'react';

type MessageFiltersProps = {
  filters: FilterState;
  sorting: { sortOrder: 'asc' | 'desc' };
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

export const MessageFilters = ({
  filters,
  sorting,
  pagination,
  activeFilterCount,
  pendingSearch,
  setPendingSearch,
  onSearch,
  onSearchBlur,
  onClearFilters,
  onFilterChange,
  onSortingChange,
}: MessageFiltersProps) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  return (
    <BaseFiltersLayout
      title="Messages"
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
          {/* Status */}
          <SegmentedFilter
            label="Status"
            value={filters.processed ?? 'all'}
            onChange={(v) => onFilterChange('processed', v)}
            options={[
              { value: 'all', label: 'All' },
              { value: 'unprocessed', label: 'Unprocessed' },
              { value: 'processed', label: 'Processed' },
              { value: 'resolved', label: 'Resolved' },
            ]}
            mobileRows={[2, 2]}
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
              onFilterChange('messageSourceId', v === 'all' ? undefined : Number(v))
            }
            className="min-w-[200px]"
          />
          <div className="hidden mx-3 w-px h-8 sm:block bg-border" />
          {/* Sort */}
          <SortOrderFilter
            value={sorting.sortOrder}
            onChange={(sortOrder) => onSortingChange(sortOrder)}
          />
        </div>
        <AdvancedFiltersToggle open={showAdvanced} onToggle={() => setShowAdvanced((v) => !v)} />
        {showAdvanced && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:flex lg:flex-wrap lg:gap-3 gap-2">
            {/* Advanced filters go here (reuse previous checkboxes or add new ones) */}
            <label className="flex gap-2 items-center cursor-pointer">
              <input
                type="checkbox"
                checked={filters.showSpam ?? false}
                onChange={(e) => onFilterChange('showSpam', e.target.checked)}
                className="w-4 h-4 rounded text-primary border-border focus:ring-2 focus:ring-primary"
              />
              <div className="flex gap-1 items-center text-xs font-medium">
                <ShieldX className="w-3 h-3" />
                <span>Spam</span>
              </div>
            </label>
            <label className="flex gap-2 items-center cursor-pointer">
              <input
                type="checkbox"
                checked={filters.showSuspicious ?? false}
                onChange={(e) => onFilterChange('showSuspicious', e.target.checked)}
                className="w-4 h-4 rounded text-primary border-border focus:ring-2 focus:ring-primary"
              />
              <div className="flex gap-1 items-center text-xs font-medium">
                <ShieldX className="w-3 h-3 text-yellow-500" />
                <span>Suspicious</span>
              </div>
            </label>
            <label className="flex gap-2 items-center cursor-pointer">
              <input
                type="checkbox"
                checked={filters.excludeSpam ?? false}
                onChange={(e) => onFilterChange('excludeSpam', e.target.checked)}
                className="w-4 h-4 rounded text-primary border-border focus:ring-2 focus:ring-primary"
              />
              <div className="flex gap-1 items-center text-xs font-medium">
                <ShieldX className="w-3 h-3 text-green-500" />
                <span>Exclude Spam</span>
              </div>
            </label>
            <label className="flex gap-2 items-center cursor-pointer">
              <input
                type="checkbox"
                checked={filters.hasAttachments ?? false}
                onChange={(e) => onFilterChange('hasAttachments', e.target.checked)}
                className="w-4 h-4 rounded text-primary border-border focus:ring-2 focus:ring-primary"
              />
              <div className="flex gap-1 items-center text-xs font-medium">
                <Paperclip className="w-3 h-3" />
                <span>Attachments</span>
              </div>
            </label>
            <label className="flex gap-2 items-center cursor-pointer">
              <input
                type="checkbox"
                checked={filters.hasReplies ?? false}
                onChange={(e) => onFilterChange('hasReplies', e.target.checked)}
                className="w-4 h-4 rounded text-primary border-border focus:ring-2 focus:ring-primary"
              />
              <div className="flex gap-1 items-center text-xs font-medium">
                <MessageCircle className="w-3 h-3" />
                <span>Replies</span>
              </div>
            </label>
            <label className="flex gap-2 items-center cursor-pointer">
              <input
                type="checkbox"
                checked={filters.hasTicket === true}
                onChange={(e) =>
                  onFilterChange('hasTicket', e.target.checked ? true : undefined)
                }
                className="w-4 h-4 rounded text-primary border-border focus:ring-2 focus:ring-primary"
              />
              <div className="flex gap-1 items-center text-xs font-medium">
                <Ticket className="w-3 h-3 text-green-500" />
                <span>Has Ticket</span>
              </div>
            </label>
            <label className="flex gap-2 items-center cursor-pointer">
              <input
                type="checkbox"
                checked={filters.hasTicket === false}
                onChange={(e) =>
                  onFilterChange('hasTicket', e.target.checked ? false : undefined)
                }
                className="w-4 h-4 rounded text-primary border-border focus:ring-2 focus:ring-primary"
              />
              <div className="flex gap-1 items-center text-xs font-medium">
                <Ticket className="w-3 h-3 text-muted-foreground" />
                <span>No Ticket</span>
              </div>
            </label>
            <label className="flex gap-2 items-center cursor-pointer">
              <input
                type="checkbox"
                checked={filters.showFailed ?? false}
                onChange={(e) => onFilterChange('showFailed', e.target.checked)}
                className="w-4 h-4 rounded text-primary border-border focus:ring-2 focus:ring-primary"
              />
              <div className="flex gap-1 items-center text-xs font-medium text-red-600 dark:text-red-400">
                <XCircle className="w-3 h-3" />
                <span>Failed</span>
              </div>
            </label>
            <label className="flex gap-2 items-center cursor-pointer">
              <input
                type="checkbox"
                checked={filters.awaitingCustomerResponse ?? false}
                onChange={(e) =>
                  onFilterChange('awaitingCustomerResponse', e.target.checked)
                }
                className="w-4 h-4 rounded text-primary border-border focus:ring-2 focus:ring-primary"
              />
              <div className="flex gap-1 items-center text-xs font-medium">
                <Clock className="w-3 h-3 text-blue-500" />
                <span>Awaiting Response</span>
              </div>
            </label>
            <label className="flex gap-2 items-center cursor-pointer">
              <input
                type="checkbox"
                checked={filters.customerResponded ?? false}
                onChange={(e) => onFilterChange('customerResponded', e.target.checked)}
                className="w-4 h-4 rounded text-primary border-border focus:ring-2 focus:ring-primary"
              />
              <div className="flex gap-1 items-center text-xs font-medium">
                <MessageCircle className="w-3 h-3 text-orange-500" />
                <span>Customer Replied</span>
              </div>
            </label>
            <label className="flex gap-2 items-center cursor-pointer">
              <input
                type="checkbox"
                checked={filters.excludeKB ?? false}
                onChange={(e) => onFilterChange('excludeKB', e.target.checked)}
                className="w-4 h-4 rounded text-primary border-border focus:ring-2 focus:ring-primary"
              />
              <div className="flex gap-1 items-center text-xs font-medium">
                <BookOpen className="w-3 h-3 text-purple-500" />
                <span>Exclude KB</span>
              </div>
            </label>
          </div>
        )}
      </div>
    </BaseFiltersLayout>
  );
};
