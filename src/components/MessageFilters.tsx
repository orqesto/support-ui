import { Filter, X, Paperclip, XCircle, MessageCircle } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import type { FilterState, SortingState } from '@/stores/messagesStore';

type MessageFiltersProps = {
  filters: FilterState;
  sorting: SortingState;
  pendingSearch: string;
  activeFilterCount: number;
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
  onFilterChange: (key: string, value: string) => void;
  onSearch: () => void;
  onSearchBlur: () => void;
  onClearFilters: () => void;
  onSortingChange: (sortOrder: 'asc' | 'desc') => void;
  setPendingSearch: (value: string) => void;
  setFilters: (filters: Partial<FilterState>) => void;
};

export const MessageFilters = ({
  filters,
  sorting,
  pendingSearch,
  activeFilterCount,
  pagination,
  onFilterChange,
  onSearch,
  onSearchBlur,
  onClearFilters,
  onSortingChange,
  setPendingSearch,
  setFilters,
}: MessageFiltersProps) => (
  <Card>
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Header */}
          <div className="flex flex-wrap gap-2 justify-between items-center min-h-[32px]">
            <div className="flex flex-wrap gap-2 items-center">
              <div className="flex gap-2 items-center">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Filters</span>
                <Badge variant="default" className="text-xs">
                  {activeFilterCount}
                </Badge>
              </div>
              {pagination.total > 0 && (
                <span className="text-xs whitespace-nowrap text-muted-foreground">
                  {(pagination.page - 1) * pagination.limit + 1}-
                  {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                  {pagination.total}
                </span>
              )}
            </div>
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={onClearFilters} className="shrink-0">
                <X className="mr-1 w-3 h-3" />
                Clear
              </Button>
            )}
          </div>

          {/* Filter Controls */}
          <div className="flex flex-col gap-3">
            {/* Row 1: Search */}
            <div className="flex flex-wrap gap-3 items-center">
              <SearchInput
                value={pendingSearch}
                onChange={(value) => {
                  setPendingSearch(value);
                  onFilterChange('search', value);
                }}
                onSearch={onSearch}
                onBlur={onSearchBlur}
                showSearchButton={true}
                placeholder="Search by ID, email, subject, content..."
                className="flex-1 min-w-[300px]"
                size="sm"
              />
            </div>

            {/* Row 2: Main Filters */}
            <div className="flex flex-wrap gap-4 items-center">
              {/* Status Group */}
              <div className="flex gap-2 items-center">
                <span className="text-xs font-semibold whitespace-nowrap text-muted-foreground">
                  Status:
                </span>
                <div className="inline-flex rounded-md shadow-sm">
                  <Button
                    variant={filters.processed === 'false' ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => onFilterChange('processed', 'false')}
                    className="h-8 text-xs rounded-l-md rounded-r-none border-r-0"
                  >
                    Unprocessed
                  </Button>
                  <Button
                    variant={filters.processed === 'true' ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => onFilterChange('processed', 'true')}
                    className="h-8 text-xs rounded-none border-r-0"
                  >
                    Processed
                  </Button>
                  <Button
                    variant={filters.processed === 'all' ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => onFilterChange('processed', 'all')}
                    className="h-8 text-xs rounded-r-md rounded-l-none"
                  >
                    All
                  </Button>
                </div>
              </div>

              {/* Divider */}
              <div className="h-8 w-px bg-border" />

              {/* Channel Group */}
              <div className="flex gap-2 items-center">
                <span className="text-xs font-semibold whitespace-nowrap text-muted-foreground">
                  Channel:
                </span>
                <Select
                  value={filters.channel}
                  onChange={(e) => onFilterChange('channel', e.target.value)}
                  className="px-2 py-1 pr-8 h-8 text-xs"
                  aria-label="Filter by channel"
                >
                  <option value="all">All</option>
                  <option value="email">Email</option>
                  <option value="telegram">Telegram</option>
                  <option value="slack">Slack</option>
                </Select>
              </div>

              {/* Divider */}
              <div className="h-8 w-px bg-border" />

              {/* AI Filter Group */}
              <div className="flex gap-2 items-center">
                <span className="text-xs font-semibold whitespace-nowrap text-muted-foreground">
                  AI Filter:
                </span>
                <Select
                  value={
                    filters.showSpam
                      ? 'spam'
                      : filters.showWorthy
                        ? 'worthy'
                        : filters.showNeedsInfo
                          ? 'needsInfo'
                          : 'none'
                  }
                  onChange={(e) => {
                    const value = e.target.value;
                    setFilters({
                      ...filters,
                      showSpam: value === 'spam',
                      showWorthy: value === 'worthy',
                      showNeedsInfo: value === 'needsInfo',
                    });
                  }}
                  className="px-2 py-1 pr-8 h-8 text-xs compact"
                  aria-label="Filter by AI analysis"
                >
                  <option value="none">None</option>
                  <option value="spam">Spam</option>
                  <option value="worthy">Ticket Worthy</option>
                  <option value="needsInfo">Needs Info</option>
                </Select>
              </div>

              {/* Divider */}
              <div className="h-8 w-px bg-border" />

              {/* Content Filters Group */}
              <div className="flex flex-wrap gap-3 items-center">
                <label className="flex gap-2 items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.hasAttachments ?? false}
                    onChange={(e) => setFilters({ ...filters, hasAttachments: e.target.checked })}
                    className="w-4 h-4 rounded text-primary border-border focus:ring-2 focus:ring-primary"
                  />
                  <div className="flex gap-1 items-center text-xs font-medium whitespace-nowrap">
                    <Paperclip className="w-3 h-3" />
                    <span>Attachments</span>
                  </div>
                </label>

                <label className="flex gap-2 items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.hasReplies ?? false}
                    onChange={(e) => setFilters({ ...filters, hasReplies: e.target.checked })}
                    className="w-4 h-4 rounded text-primary border-border focus:ring-2 focus:ring-primary"
                  />
                  <div className="flex gap-1 items-center text-xs font-medium whitespace-nowrap">
                    <MessageCircle className="w-3 h-3" />
                    <span>Replies</span>
                  </div>
                </label>

                <label className="flex gap-2 items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.showFailed ?? false}
                    onChange={(e) => setFilters({ ...filters, showFailed: e.target.checked })}
                    className="w-4 h-4 rounded text-primary border-border focus:ring-2 focus:ring-primary"
                  />
                  <div className="flex gap-1 items-center text-xs font-medium whitespace-nowrap text-red-600 dark:text-red-400">
                    <XCircle className="w-3 h-3" />
                    <span>Failed</span>
                  </div>
                </label>
              </div>

              {/* Divider */}
              <div className="h-8 w-px bg-border" />

              {/* Sort Order Group */}
              <div className="flex gap-2 items-center">
                <span className="text-xs font-semibold whitespace-nowrap text-muted-foreground">
                  Order:
                </span>
                <Select
                  value={sorting.sortOrder}
                  onChange={(e) => onSortingChange(e.target.value as 'asc' | 'desc')}
                  className="px-2 py-1 pr-8 h-8 text-xs"
                  aria-label="Sort order"
                >
                  <option value="desc">Newest First</option>
                  <option value="asc">Oldest First</option>
                </Select>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
);
