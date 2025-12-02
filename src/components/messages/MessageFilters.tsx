import { useEffect, useState } from 'react';
import {
  Filter,
  X,
  Paperclip,
  XCircle,
  MessageCircle,
  Ticket,
  Inbox,
  ShieldX,
  Info,
  ChevronDown,
  ChevronUp,
  Clock,
  BookOpen,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { SearchInput } from '@/components/ui/SearchInput';
import { useFilterPanel } from '@/hooks/useFilterPanel';
import { integrationsService, type Integration } from '@/services/integrations.service';
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
}: MessageFiltersProps) => {
  const [messageSources, setMessageSources] = useState<Integration[]>([]);

  const { showAdvancedFilters, toggleAdvancedFilters } = useFilterPanel({
    filters,
  });

  // Fetch message sources on mount
  useEffect(() => {
    const fetchSources = async () => {
      try {
        const response = await integrationsService.getAll();
        if (response.success && response.data) {
          // Filter to only message sources (email, telegram, slack)
          const sources = response.data.filter((integration) =>
            ['email', 'gmail', 'telegram', 'slack'].includes(integration.type)
          );
          setMessageSources(sources);
        }
      } catch (error) {
        console.error('Failed to fetch message sources:', error);
      }
    };
    void fetchSources();
  }, []);

  // Helper to get active filter labels
  const getActiveFilters = () => {
    const active: Array<{ key: string; label: string; value: string }> = [];

    if (filters.processed !== 'all') {
      active.push({ key: 'processed', label: 'Status', value: filters.processed ?? '' });
    }
    if (filters.channel !== 'all') {
      active.push({ key: 'channel', label: 'Channel', value: filters.channel ?? '' });
    }
    if (filters.messageSourceId && filters.messageSourceId !== 'all') {
      const source = messageSources.find((s) => s.id.toString() === filters.messageSourceId);
      active.push({
        key: 'messageSourceId',
        label: 'Source',
        value: source?.name ?? filters.messageSourceId,
      });
    }
    if (filters.showSpam) {
      active.push({ key: 'showSpam', label: 'Filter', value: 'Spam' });
    }
    if (filters.excludeSpam) {
      active.push({ key: 'excludeSpam', label: 'Filter', value: 'Exclude Spam' });
    }
    if (filters.showWorthy) {
      active.push({ key: 'showWorthy', label: 'Filter', value: 'Ticket Worthy' });
    }
    if (filters.showNeedsInfo) {
      active.push({ key: 'showNeedsInfo', label: 'Filter', value: 'Needs Info' });
    }
    if (filters.hasAttachments) {
      active.push({ key: 'hasAttachments', label: 'Filter', value: 'Has Attachments' });
    }
    if (filters.hasReplies) {
      active.push({ key: 'hasReplies', label: 'Filter', value: 'Has Replies' });
    }
    if (filters.hasTicket === true) {
      active.push({ key: 'hasTicket', label: 'Filter', value: 'Has Ticket' });
    }
    if (filters.hasTicket === false) {
      active.push({ key: 'hasTicket', label: 'Filter', value: 'No Ticket' });
    }
    if (filters.showFailed) {
      active.push({ key: 'showFailed', label: 'Filter', value: 'Failed' });
    }
    if (filters.awaitingCustomerResponse) {
      active.push({ key: 'awaitingCustomerResponse', label: 'Filter', value: 'Awaiting Response' });
    }

    return active;
  };

  const activeFilters = getActiveFilters();

  const removeFilter = (key: string) => {
    if (key === 'processed') {
      onFilterChange('processed', 'all');
    } else if (key === 'channel') {
      onFilterChange('channel', 'all');
    } else if (key === 'messageSourceId') {
      onFilterChange('messageSourceId', 'all');
    } else if (
      key === 'showSpam' ||
      key === 'excludeSpam' ||
      key === 'showWorthy' ||
      key === 'showNeedsInfo' ||
      key === 'hasAttachments' ||
      key === 'hasReplies' ||
      key === 'showFailed' ||
      key === 'awaitingCustomerResponse'
    ) {
      setFilters({ ...filters, [key]: false });
    } else if (key === 'hasTicket') {
      setFilters({ ...filters, hasTicket: undefined });
    }
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="space-y-4">
          {/* Header */}
          <div className="flex flex-wrap gap-3 justify-between items-center">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex gap-2 items-center">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-semibold">Filters</span>
                {activeFilterCount > 0 && (
                  <Badge variant="default" className="text-xs">
                    {activeFilterCount}
                  </Badge>
                )}
              </div>
              {pagination.total > 0 && (
                <span className="text-xs whitespace-nowrap text-muted-foreground">
                  {(pagination.page - 1) * pagination.limit + 1}-
                  {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                  {pagination.total}
                </span>
              )}
            </div>
            <div className="flex gap-2 items-center">
              {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" onClick={onClearFilters} className="h-8 shrink-0">
                  <X className="mr-1 w-3 h-3" />
                  Clear All
                </Button>
              )}
            </div>
          </div>

          {/* Active Filter Pills */}
          {activeFilters.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {activeFilters.map((filter, index) => (
                <Badge
                  key={`${filter.key}-${index}`}
                  variant="secondary"
                  className="flex gap-1 items-center py-1 pr-1 pl-2 text-xs group"
                >
                  <span className="font-normal text-muted-foreground">{filter.label}:</span>
                  <span className="font-medium capitalize">{filter.value}</span>
                  <button
                    onClick={() => removeFilter(filter.key)}
                    className="ml-1 rounded-full hover:bg-muted-foreground/20 transition-colors p-0.5"
                    aria-label={`Remove ${filter.label} filter`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

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
                className="flex-1 min-w-[200px] sm:min-w-[300px]"
                size="sm"
              />
            </div>

            {/* Primary Filters Row */}
            <div className="p-4 rounded-lg border bg-muted/30">
              <div className="flex flex-col gap-3 rounded-md sm:flex-row sm:flex-wrap sm:items-center">
                {/* Status Group */}
                <div className="flex gap-2 items-center">
                  <span className="text-xs font-semibold whitespace-nowrap text-muted-foreground">
                    Status:
                  </span>
                  <div className="flex flex-col gap-2 w-full rounded-md shadow-sm sm:inline-flex sm:flex-row sm:w-auto">
                    <Button
                      variant={filters.processed === 'unprocessed' ? 'primary' : 'outline'}
                      size="sm"
                      onClick={() => onFilterChange('processed', 'unprocessed')}
                      className="h-8 text-xs rounded-r-none rounded-l-md border-r-0"
                    >
                      Unprocessed
                    </Button>
                    <Button
                      variant={filters.processed === 'processed' ? 'primary' : 'outline'}
                      size="sm"
                      onClick={() => onFilterChange('processed', 'processed')}
                      className="h-8 text-xs rounded-none border-r-0"
                    >
                      Processed
                    </Button>
                    <Button
                      variant={filters.processed === 'resolved' ? 'primary' : 'outline'}
                      size="sm"
                      onClick={() => onFilterChange('processed', 'resolved')}
                      className="h-8 text-xs rounded-none border-r-0"
                    >
                      Resolved
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

                {/* Divider - hidden on mobile */}
                <div className="hidden mx-3 w-px h-8 sm:block bg-border" />

                {/* Channel Group */}
                <div className="flex gap-2 items-center min-w-[140px] sm:pr-4">
                  <span className="text-xs font-semibold whitespace-nowrap text-muted-foreground">
                    Channel:
                  </span>
                  <ReactSelect
                    value={filters.channel}
                    onChange={(value) => onFilterChange('channel', value)}
                    options={[
                      { value: 'all', label: 'All' },
                      { value: 'email', label: 'Email' },
                      { value: 'telegram', label: 'Telegram' },
                      { value: 'slack', label: 'Slack' },
                    ]}
                    className="min-w-[120px] sm:w-auto"
                  />
                </div>

                {/* Divider - hidden on mobile */}
                <div className="hidden mx-3 w-px h-8 lg:block bg-border" />

                {/* Message Source Group */}
                <div className="flex gap-2 items-center min-w-[140px] sm:pr-4">
                  <span className="text-xs font-semibold whitespace-nowrap text-muted-foreground">
                    <Inbox className="inline hidden mr-1 w-3 h-3 sm:block" />
                    Source:
                  </span>
                  <ReactSelect
                    value={filters.messageSourceId ?? 'all'}
                    onChange={(value) => onFilterChange('messageSourceId', value)}
                    options={[
                      { value: 'all', label: 'All Sources' },
                      ...messageSources.map((source) => ({
                        value: source.id.toString(),
                        label: source.name,
                      })),
                    ]}
                    className="min-w-[120px] sm:w-auto"
                  />
                </div>

                {/* Divider - hidden on mobile */}
                <div className="hidden mx-3 w-px h-8 lg:block bg-border" />

                {/* Sort Order */}
                <div className="flex gap-2 items-center min-w-[140px]">
                  <span className="text-xs font-semibold whitespace-nowrap text-muted-foreground">
                    Sort:
                  </span>
                  <ReactSelect
                    value={sorting.sortOrder}
                    onChange={(value) => onSortingChange(value as 'asc' | 'desc')}
                    options={[
                      { value: 'desc', label: 'Oldest First' },
                      { value: 'asc', label: 'Newest First' },
                    ]}
                    className="min-w-[120px] sm:w-auto"
                  />
                </div>
              </div>
            </div>

            {/* Advanced Filters Toggle */}
            <div className="flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleAdvancedFilters}
                className="gap-2 h-8 text-xs"
              >
                {showAdvancedFilters ? (
                  <>
                    <ChevronUp className="w-3 h-3" />
                    Hide Advanced Filters
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3 h-3" />
                    Show Advanced Filters
                  </>
                )}
              </Button>
            </div>

            {/* Advanced Filters Section */}
            {showAdvancedFilters && (
              <div className="p-3 space-y-3 rounded-lg border bg-muted/10">
                <div className="flex gap-2 items-center">
                  <Filter className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground">
                    Advanced Filters
                  </span>
                </div>

                {/* Contextual Filters - shown based on status */}
                <div className="flex flex-wrap gap-3 items-center">
                  {/* Spam filters - available for all messages (processed or not) */}
                  <label className="flex gap-2 items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.showSpam ?? false}
                      onChange={(e) =>
                        setFilters({
                          ...filters,
                          showSpam: e.target.checked,
                          showSuspicious: false,
                          excludeSpam: false,
                        })
                      }
                      className="w-4 h-4 rounded text-primary border-border focus:ring-2 focus:ring-primary"
                    />
                    <div className="flex gap-1 items-center text-xs font-medium whitespace-nowrap">
                      <ShieldX className="w-3 h-3" />
                      <span>Spam</span>
                    </div>
                  </label>

                  <label className="flex gap-2 items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.showSuspicious ?? false}
                      onChange={(e) =>
                        setFilters({
                          ...filters,
                          showSuspicious: e.target.checked,
                          showSpam: false,
                          excludeSpam: false,
                        })
                      }
                      className="w-4 h-4 rounded text-primary border-border focus:ring-2 focus:ring-primary"
                    />
                    <div className="flex gap-1 items-center text-xs font-medium whitespace-nowrap">
                      <ShieldX className="w-3 h-3 text-yellow-500" />
                      <span>Suspicious</span>
                    </div>
                  </label>

                  <label className="flex gap-2 items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.excludeSpam ?? false}
                      onChange={(e) =>
                        setFilters({
                          ...filters,
                          excludeSpam: e.target.checked,
                          showSpam: false,
                          showSuspicious: false,
                        })
                      }
                      className="w-4 h-4 rounded text-primary border-border focus:ring-2 focus:ring-primary"
                    />
                    <div className="flex gap-1 items-center text-xs font-medium whitespace-nowrap">
                      <ShieldX className="w-3 h-3 text-green-500" />
                      <span>Exclude Spam</span>
                    </div>
                  </label>

                  {/* Show Ticket Worthy & Needs Info only for Processed */}
                  {filters.processed === 'processed' && (
                    <>
                      <label className="flex gap-2 items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filters.showWorthy ?? false}
                          onChange={(e) => setFilters({ ...filters, showWorthy: e.target.checked })}
                          className="w-4 h-4 rounded text-primary border-border focus:ring-2 focus:ring-primary"
                        />
                        <div className="flex gap-1 items-center text-xs font-medium whitespace-nowrap">
                          <Ticket className="w-3 h-3" />
                          <span>Ticket Worthy</span>
                        </div>
                      </label>

                      <label className="flex gap-2 items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filters.showNeedsInfo ?? false}
                          onChange={(e) =>
                            setFilters({ ...filters, showNeedsInfo: e.target.checked })
                          }
                          className="w-4 h-4 rounded text-primary border-border focus:ring-2 focus:ring-primary"
                        />
                        <div className="flex gap-1 items-center text-xs font-medium whitespace-nowrap">
                          <Info className="w-3 h-3" />
                          <span>Needs Info</span>
                        </div>
                      </label>
                    </>
                  )}

                  {/* Common filters - always visible */}
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

                  {/* Ticket filters - checkboxes (mutually exclusive like spam filters) */}
                  <label className="flex gap-2 items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.hasTicket === true}
                      onChange={(e) => {
                        if (e.target.checked) {
                          // Check this, uncheck the other
                          setFilters({ ...filters, hasTicket: true });
                        } else {
                          // Uncheck - show all
                          setFilters({ ...filters, hasTicket: undefined });
                        }
                      }}
                      className="w-4 h-4 rounded text-primary border-border focus:ring-2 focus:ring-primary"
                    />
                    <div className="flex gap-1 items-center text-xs font-medium whitespace-nowrap">
                      <Ticket className="w-3 h-3 text-green-500" />
                      <span>Has Ticket</span>
                    </div>
                  </label>

                  <label className="flex gap-2 items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.hasTicket === false}
                      onChange={(e) => {
                        if (e.target.checked) {
                          // Check this, uncheck the other
                          setFilters({ ...filters, hasTicket: false });
                        } else {
                          // Uncheck - show all
                          setFilters({ ...filters, hasTicket: undefined });
                        }
                      }}
                      className="w-4 h-4 rounded text-primary border-border focus:ring-2 focus:ring-primary"
                    />
                    <div className="flex gap-1 items-center text-xs font-medium whitespace-nowrap">
                      <Ticket className="w-3 h-3 text-muted-foreground" />
                      <span>No Ticket</span>
                    </div>
                  </label>

                  <label className="flex gap-2 items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.showFailed ?? false}
                      onChange={(e) => setFilters({ ...filters, showFailed: e.target.checked })}
                      className="w-4 h-4 rounded text-primary border-border focus:ring-2 focus:ring-primary"
                    />
                    <div className="flex gap-1 items-center text-xs font-medium text-red-600 whitespace-nowrap dark:text-red-400">
                      <XCircle className="w-3 h-3" />
                      <span>Failed</span>
                    </div>
                  </label>

                  <label className="flex gap-2 items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.awaitingCustomerResponse ?? false}
                      onChange={(e) =>
                        setFilters({ ...filters, awaitingCustomerResponse: e.target.checked })
                      }
                      className="w-4 h-4 rounded text-primary border-border focus:ring-2 focus:ring-primary"
                    />
                    <div className="flex gap-1 items-center text-xs font-medium whitespace-nowrap">
                      <Clock className="w-3 h-3 text-blue-500" />
                      <span>Awaiting Response</span>
                    </div>
                  </label>

                  <label className="flex gap-2 items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.excludeKB ?? false}
                      onChange={(e) => setFilters({ ...filters, excludeKB: e.target.checked })}
                      className="w-4 h-4 rounded text-primary border-border focus:ring-2 focus:ring-primary"
                    />
                    <div className="flex gap-1 items-center text-xs font-medium whitespace-nowrap">
                      <BookOpen className="w-3 h-3 text-purple-500" />
                      <span>Exclude KB</span>
                    </div>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
